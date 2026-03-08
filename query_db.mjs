import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tywvnbmarnbhpnjirwaj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5d3ZuYm1hcm5iaHBuamlyd2FqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjkyNTQ0OCwiZXhwIjoyMDg4NTAxNDQ4fQ.d_8RGBRwt0lpuafO-AHGJkSLyPA0-8uKvNrCbf_sHng'
);

async function run() {
  const { data, error } = await supabase.from('school_adjustment_submissions').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) console.error(error);
  else console.table(data);
}
run();
