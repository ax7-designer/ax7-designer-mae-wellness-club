import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🚀 MAE Wellness Club — Integration Test Runner');
console.log('━'.repeat(50));

if (!SUPABASE_URL) {
  console.error('❌ Error: VITE_SUPABASE_URL is not set in .env');
  process.exit(1);
}

// Check if service role key is configured
const hasServiceRole = SERVICE_ROLE_KEY && !SERVICE_ROLE_KEY.includes('PEGAR_AQUI') && SERVICE_ROLE_KEY.length > 20;

if (!hasServiceRole) {
  console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY is not configured in your .env file.');
  console.log('   You can still run tests directly in your Supabase SQL Editor:');
  console.log('   👉 Copy the contents of test/rpc-tests.sql and run: SELECT run_tests();');
  console.log('\n   Or add your service_role key to .env to run from console:');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=your_key_here\n');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('⏳ Running database integration tests on Supabase...');
  
  const { data, error } = await supabase.rpc('run_tests');
  
  if (error) {
    console.error('\n❌ RPC Execution failed:');
    console.error(error.message);
    process.exit(1);
  }
  
  if (data && data.startsWith('SUCCESS')) {
    console.log(`\n🎉 ${data}`);
    process.exit(0);
  } else {
    console.error(`\n❌ ${data || 'Test suite returned unknown status.'}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n❌ Execution error:', err.message);
  process.exit(1);
});
