const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function updateLegacyMetadata() {
    try {
        console.log('Updating metadata for Legacy Link and Product...');
        
        // The Legacy Link I created was https://buy.stripe.com/bJeeVccDsf8X4Hc2uJdby0b
        // I need to find its ID or the Price ID associated.
        // I know the Price ID was price_1TMbHCCnUAeOBVYyjLC2Rdm8
        
        const price = await stripe.prices.retrieve('price_1TMbHCCnUAeOBVYyjLC2Rdm8', { expand: ['product'] });
        const productId = price.product.id;

        // Update Product Metadata
        await stripe.products.update(productId, {
            metadata: { 
                mae_id: 'pte_20_legacy',
                credits: '20' 
            }
        });
        console.log(`✓ Product ${productId} updated with 20 credits.`);

        // Also update the Payment Link metadata just in case
        // We know the URL, we can search or use the one from previous output if I had it.
        // Actually, updating the Product is enough for my Webhook logic.
        
        console.log('DONE. Automation will now recognize the 20 credits for this legacy link.');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

updateLegacyMetadata();
