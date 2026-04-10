import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('YOUR_SECRET_KEY_HERE')) {
    console.error('❌ Error: STRIPE_SECRET_KEY not found or invalid in .env');
    process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function configureBranding() {
    console.log('🚀 Starting MAE Wellness Club Branding Configuration...');

    try {
        const account = await stripe.accounts.retrieve();
        console.log(`✅ Connected to account: ${account.id}`);

        console.log('⏳ Updating branding color...');
        try {
            await stripe.accounts.update(account.id, {
                settings: {
                    branding: {
                        primary_color: '#C9A96E',
                    },
                }
            });
            console.log('✅ Color updated (#C9A96E).');
        } catch (e) {
            console.error('❌ Branding Color update failed:', e.message);
        }

        console.log('⏳ Updating business profile...');
        try {
            await stripe.accounts.update(account.id, {
                business_profile: {
                    name: 'MAE Wellness Club',
                    support_email: 'maewellnessclub@gmail.com',
                    url: 'https://maewellnessclub.com.mx'
                }
            });
            console.log('✅ Business profile updated.');
        } catch (e) {
            console.error('❌ Profile update failed:', e.message);
        }

    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
    }
}

configureBranding();
