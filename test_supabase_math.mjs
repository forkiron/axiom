import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMath(schoolId, mark) {
  const { data, error } = await supabase
    .from('school_adjustment_submissions')
    .select('adjustment_factor, weight')
    .eq('school_id', schoolId);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log(`Found ${data.length} rows for ${schoolId}`);
  if (data.length > 0) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const row of data) {
      console.log('Row:', row);
      const w = typeof row.weight === 'number' && row.weight > 0 ? row.weight : 1;
      const af = Number(row.adjustment_factor);
      if (Number.isFinite(af)) {
        weightedSum += af * w;
        totalWeight += w;
      }
    }
    console.log(`weightedSum: ${weightedSum}, totalWeight: ${totalWeight}`);
    if (totalWeight > 0) {
      console.log(`Final adjustmentFactor: ${weightedSum / totalWeight}`);
    }
  } else {
    console.log('No rows found, falling back to default math');
  }
}

// User tested on St Therese of Lisieux
checkMath('on-q5jtcx', 85);
