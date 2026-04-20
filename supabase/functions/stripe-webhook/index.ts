// supabase/functions/stripe-webhook/index.ts
// Processes Stripe checkout.session.completed events.
// Assigns discipline-specific credits based on the product's mae_id metadata.
//
// CREDIT TYPE MAPPING (by mae_id prefix from create-stripe-links.mjs):
//   cyc_*     → Indoor Cycling  → credits_indoor
//   pte_*     → Pilates & Train → credits_pilates + credits_train (shared pool via 'pilates')
//   monthly   → VIP Membership  → credits_open (open/comodín)

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
 *   pte_*   → Pilates & Train (shared pool, stored as 'pilates' since
 *             both Train and Pilates use the SAME paquete)
 *   monthly → VIP / open comodín
 */
function resolveCreditType(maeId: string): "indoor" | "train" | "pilates" | "open" {
  if (!maeId) return "open";
  if (maeId.startsWith("cyc_"))     return "indoor";
  if (maeId.startsWith("pte_"))     return "pilates"; // Pilates & Train comparten paquete
  if (maeId === "monthly")          return "open";    // VIP: comodín total
  return "open";
}

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No stripe-signature header", { status: 400 });
  }

  try {
    const body            = await req.text();
    const endpointSecret  = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    const event           = stripe.webhooks.constructEvent(body, signature, endpointSecret);

    if (event.type !== "checkout.session.completed") {
      // Only handle completed checkouts
      return new Response(JSON.stringify({ received: true, action: "ignored" }), { status: 200 });
    }

    const session       = event.data.object;
    const userId        = session.client_reference_id;   // injected by the frontend
    const customerEmail = session.customer_details?.email ?? "";
    const paymentIntent = (session.payment_intent as string) ?? session.id;

    console.log(`[Webhook] checkout.session.completed — user: ${userId} | email: ${customerEmail}`);

    // Fetch line items to determine what was purchased
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      expand: ["data.price.product"],
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    for (const item of lineItems.data) {
      const product    = item.price?.product as Stripe.Product | null;
      const maeId      = product?.metadata?.mae_id ?? "";
      const credits    = parseInt(product?.metadata?.credits ?? "0", 10);
      const creditType = resolveCreditType(maeId);

      if (credits <= 0) {
        console.warn(`[Webhook] Skipping item with 0 credits — mae_id: ${maeId}`);
        continue;
      }

      console.log(`[Webhook] Adding ${credits} ${creditType} credits — mae_id: ${maeId}`);

      // Primary path: assign by user ID (most reliable, user must be logged in)
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
            continue;
          }
          console.error(`[Webhook] add_credits_by_id_v2 error:`, error);

          // Fallback: assign by email
          const { error: emailError } = await supabase.rpc("add_credits_by_email", {
            target_email:  customerEmail,
            amount:        credits,
            p_notes:       `Stripe webhook fallback — ${paymentIntent} | ${maeId}`,
            p_credit_type: creditType,
          });

          if (emailError) {
            console.error(`[Webhook] Fallback by email also failed:`, emailError);
          } else {
            console.log(`[Webhook] ✓ Fallback: credits assigned by email to ${customerEmail}`);
          }
        } else {
          console.log(`[Webhook] ✓ ${credits} ${creditType} credits assigned to user ${userId}`);
        }

      } else {
        // No userId (user did not log in before paying) → fallback to email
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
          } else {
            console.error(`[Webhook] Email assignment error:`, error);
          }
        } else {
          console.log(`[Webhook] ✓ ${credits} ${creditType} credits assigned by email to ${customerEmail}`);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status:  200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(`[Webhook] Fatal error: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
