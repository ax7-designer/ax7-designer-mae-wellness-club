import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.14.0"
import Stripe from "https://esm.sh/stripe@12.6.0?target=deno"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const event = stripe.webhooks.constructEvent(body, signature, endpointSecret ?? '')

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.client_reference_id
      const customerEmail = session.customer_details?.email

      console.log(`Processing payment for ${customerEmail} (ID: ${userId})`)

      // 1. Get Line Items to find what they bought
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id)
      let totalCreditsToAdd = 0

      for (const item of lineItems.data) {
        // Retrieve product to get metadata
        const product = await stripe.products.retrieve(item.price.product as string)
        const credits = parseInt(product.metadata.credits || '0')
        totalCreditsToAdd += credits
      }

      if (totalCreditsToAdd > 0) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        // 2. Update credits in DB
        // We use RPC to ensure it's atomic
        const { error } = await supabase.rpc('add_credits_by_id_v2', { 
            p_user_id: userId, 
            p_amount: totalCreditsToAdd 
        })

        if (error) {
            // Fallback to email if ID failed/missing
            console.warn("ID update failed, trying by email...", error)
            await supabase.rpc('add_credits_by_email', { 
                target_email: customerEmail, 
                amount: totalCreditsToAdd 
            })
        }
        
        console.log(`✓ Added ${totalCreditsToAdd} credits to user.`)
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
