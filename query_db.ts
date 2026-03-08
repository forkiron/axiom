import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
  const { data, error } = await supabase.from('school_adjustment_submissions').select('*').order('created_at', { ascending: false }).limit(10);
  if (error) console.error(error);
  else console.table(data);
}
run();
