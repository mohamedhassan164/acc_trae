import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.VITE_SUPABASE_URL as string;
const serviceKey = process.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
});

// Test the connection
supabaseAdmin.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.error('Supabase connection error:', error.message);
  } else {
    console.log('Supabase connection established successfully');
  }
});
