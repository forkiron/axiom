import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Server-side Supabase client with service role (for API routes). Use for school-adjustment writes. */
export function getSupabaseAdmin() {
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey);
}

export function hasSupabase(): boolean {
  return Boolean(url && serviceKey);
}
