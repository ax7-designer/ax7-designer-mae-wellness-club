// supabase/functions/stripe-webhook/index.ts
// Processes Stripe checkout.session.completed events.
// Assigns discipline-specific credits based on the product's mae_id metadata.
//
// CREDIT TYPE MAPPING (by mae_id prefix from create-stripe-links.mjs):
//   cyc_*     → Indoor Cycling  → credits_indoor
//   pte_*     → Pilates & Train → credits_pilates
//   monthly   → VIP Membership  → credits_open (open/comodín)
//
// SECURITY: verify_jwt = false (intentional).
//   Authentication is handled by Stripe's HMAC signature (stripe-signature header).
//   Supabase JWT is NOT applicable to external webhook callers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0";
import Stripe from "https://esm.sh/stripe@12.6.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Resolves the mae_id of a product to a credit_type column name.
 *
 * mae_id prefixes (from create-stripe-links.mjs):
 *   cyc_*   → Indoor Cycling
 *   pte_*   → Pilates & Train (shared pool, stored as 'pilates')
 *   monthly → VIP / open comodín
 */
function resolveCreditType(maeId: string): "indoor" | "train" | "pilates" | "open" {
  if (!maeId) return "open";
  if (maeId.startsWith("cyc_"))     return "indoor";
  if (maeId.startsWith("pte_"))     return "pilates";
  if (maeId === "monthly")          return "open";
  return "open";
}

/** Writes an audit row to stripe_webhook_events. Never throws. */
async function logWebhookEvent(
  supabase: ReturnType<typeof createClient>,
  data: {
    stripe_event_id: string;
    status: "processed" | "failed" | "duplicate" | "ignored";
    user_id?: string | null;
    email?: string | null;
    amount_credits?: number | null;
    credit_type?: string | null;
    mae_id?: string | null;
    payment_intent?: string | null;
    error_message?: string | null;
    raw_payload?: unknown;
  }
) {
  try {
    await supabase.from("stripe_webhook_events").upsert(
      {
        stripe_event_id: data.stripe_event_id,
        status:          data.status,
        user_id:         data.user_id ?? null,
        email:           data.email ?? null,
        amount_credits:  data.amount_credits ?? null,
        credit_type:     data.credit_type ?? null,
        mae_id:          data.mae_id ?? null,
        payment_intent:  data.payment_intent ?? null,
        error_message:   data.error_message ?? null,
        raw_payload:     data.raw_payload ?? null,
      },
      { onConflict: "stripe_event_id" }
    );
  } catch (err) {
    // Logging failure must never break the webhook response
    console.error("[Webhook] Failed to write audit log:", err);
  }
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No stripe-signature header", { status: 400 });
  }

  let body = "";
  let event: Stripe.Event;

  try {
    body             = await req.text();
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    event            = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (err) {
    console.error(`[Webhook] Signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only handle completed checkouts
  if (event.type !== "checkout.session.completed") {
    await logWebhookEvent(supabase, {
      stripe_event_id: event.id,
      status:          "ignored",
      raw_payload:     { type: event.type },
    });
    return new Response(JSON.stringify({ received: true, action: "ignored" }), { status: 200 });
  }

  const session       = event.data.object as Stripe.Checkout.Session;
  const userId        = session.client_reference_id;
  const customerEmail = session.customer_details?.email ?? "";
  const paymentIntent = (session.payment_intent as string) ?? session.id;

  console.log(`[Webhook] checkout.session.completed — user: ${userId} | email: ${customerEmail}`);

  // Fetch line items to determine what was purchased
  let lineItems: Stripe.LineItem[] = [];
  try {
    const result = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
    });
    lineItems = result.data;
  } catch (err) {
    console.error(`[Webhook] Failed to fetch line items:`, err);
    await logWebhookEvent(supabase, {
      stripe_event_id: event.id,
      status:          "failed",
      user_id:         userId,
      email:           customerEmail,
      payment_intent:  paymentIntent,
      error_message:   `listLineItems failed: ${err.message}`,
      raw_payload:     JSON.parse(body),
    });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  for (const item of lineItems) {
    const product    = item.price?.product as Stripe.Product | null;
    const maeId      = product?.metadata?.mae_id ?? "";
    const credits    = parseInt(product?.metadata?.credits ?? "0", 10);
    const creditType = resolveCreditType(maeId);

    if (credits <= 0) {
      console.warn(`[Webhook] Skipping item with 0 credits — mae_id: ${maeId}`);
      continue;
    }

    console.log(`[Webhook] Adding ${credits} ${creditType} credits — mae_id: ${maeId}`);

    // ── Primary path: assign by user ID ─────────────────────────
    if (userId) {
      const { error } = await supabase.rpc("add_credits_by_id_v2", {
        p_user_id:      userId,
        p_amount:       credits,
        p_reference_id: `${paymentIntent}_${maeId}`,
        p_credit_type:  creditType,
      });

      if (error) {
        if (error.message?.includes("DUPLICATE_WEBHOOK")) {
          console.log(`[Webhook] Already processed — skipping duplicate: ${paymentIntent}_${maeId}`);
          await logWebhookEvent(supabase, {
            stripe_event_id: event.id,
            status:          "duplicate",
            user_id:         userId,
            email:           customerEmail,
            amount_credits:  credits,
            credit_type:     creditType,
            mae_id:          maeId,
            payment_intent:  paymentIntent,
          });
          continue;
        }

        // Primary failed → fallback to email
        console.error(`[Webhook] add_credits_by_id_v2 error:`, error);
        const { error: emailError } = await supabase.rpc("add_credits_by_email", {
          target_email:  customerEmail,
          amount:        credits,
          p_notes:       `Stripe webhook fallback — ${paymentIntent} | ${maeId}`,
          p_credit_type: creditType,
        });

        if (emailError) {
          console.error(`[Webhook] Fallback by email also failed:`, emailError);
          await logWebhookEvent(supabase, {
            stripe_event_id: event.id,
            status:          "failed",
            user_id:         userId,
            email:           customerEmail,
            amount_credits:  credits,
            credit_type:     creditType,
            mae_id:          maeId,
            payment_intent:  paymentIntent,
            error_message:   `by_id: ${error.message} | by_email: ${emailError.message}`,
            raw_payload:     JSON.parse(body),
          });
        } else {
          console.log(`[Webhook] ✓ Fallback: credits assigned by email to ${customerEmail}`);
          await logWebhookEvent(supabase, {
            stripe_event_id: event.id,
            status:          "processed",
            user_id:         userId,
            email:           customerEmail,
            amount_credits:  credits,
            credit_type:     creditType,
            mae_id:          maeId,
            payment_intent:  paymentIntent,
            error_message:   `Assigned via email fallback (by_id failed: ${error.message})`,
          });
        }

      } else {
        console.log(`[Webhook] ✓ ${credits} ${creditType} credits assigned to user ${userId}`);
        await logWebhookEvent(supabase, {
          stripe_event_id: event.id,
          status:          "processed",
          user_id:         userId,
          email:           customerEmail,
          amount_credits:  credits,
          credit_type:     creditType,
          mae_id:          maeId,
          payment_intent:  paymentIntent,
        });
      }

    } else {
      // ── No userId: fallback to email ──────────────────────────
      console.warn(`[Webhook] No client_reference_id — falling back to email: ${customerEmail}`);
      const { error } = await supabase.rpc("add_credits_by_email", {
        target_email:  customerEmail,
        amount:        credits,
        p_notes:       `Stripe webhook (sin ID usuario) — ${paymentIntent} | ${maeId}`,
        p_credit_type: creditType,
      });

      if (error) {
        if (error.message?.includes("DUPLICATE_WEBHOOK")) {
          console.log(`[Webhook] Duplicate by email — skipping.`);
          await logWebhookEvent(supabase, {
            stripe_event_id: event.id,
            status:          "duplicate",
            email:           customerEmail,
            amount_credits:  credits,
            credit_type:     creditType,
            mae_id:          maeId,
            payment_intent:  paymentIntent,
          });
        } else {
          console.error(`[Webhook] Email assignment error:`, error);
          await logWebhookEvent(supabase, {
            stripe_event_id: event.id,
            status:          "failed",
            email:           customerEmail,
            amount_credits:  credits,
            credit_type:     creditType,
            mae_id:          maeId,
            payment_intent:  paymentIntent,
            error_message:   error.message,
            raw_payload:     JSON.parse(body),
          });
        }
      } else {
        console.log(`[Webhook] ✓ ${credits} ${creditType} credits assigned by email to ${customerEmail}`);
        await logWebhookEvent(supabase, {
          stripe_event_id: event.id,
          status:          "processed",
          email:           customerEmail,
          amount_credits:  credits,
          credit_type:     creditType,
          mae_id:          maeId,
          payment_intent:  paymentIntent,
          error_message:   "Assigned via email (no client_reference_id)",
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  });
});
