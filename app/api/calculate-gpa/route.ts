import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase';
import { ANALYZER_SCHOOL_OPTIONS } from '@/lib/all-schools';

export const dynamic = 'force-dynamic';

const W_S = 1.5;

function getProvinceMedianRating(province: string): number {
  const target = province.toUpperCase();
  const ratings = ANALYZER_SCHOOL_OPTIONS
    .filter((s) => s.province.toUpperCase() === target)
    .map((s) => (s as any).rating)
    .filter((r) => typeof r === 'number' && Number.isFinite(r))
    .sort((a, b) => a - b);

  if (ratings.length === 0) return 5;
  const mid = Math.floor(ratings.length / 2);
  return ratings.length % 2 === 0 ? (ratings[mid - 1] + ratings[mid]) / 2 : ratings[mid];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const mark = searchParams.get('mark');

  if (!schoolId || !mark) {
    return NextResponse.json({ error: 'Missing schoolId or mark' }, { status: 400 });
  }

  const numericMark = parseFloat(mark);
  if (isNaN(numericMark) || numericMark < 0 || numericMark > 100) {
    return NextResponse.json({ error: 'Invalid mark' }, { status: 400 });
  }

  let adjustmentFactor = 0;

  try {
    if (hasSupabase()) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('school_adjustment_submissions')
        .select('adjustment_factor, weight')
        .eq('school_id', schoolId);

      if (!error && data && data.length > 0) {
        let totalWeight = 0;
        let weightedSum = 0;
        for (const row of data) {
          const w = typeof row.weight === 'number' && row.weight > 0 ? row.weight : 1;
          const af = Number(row.adjustment_factor);
          if (Number.isFinite(af)) {
            weightedSum += af * w;
            totalWeight += w;
          }
        }
        if (totalWeight > 0) {
          adjustmentFactor = weightedSum / totalWeight;
        }
      } else {
        // Fallback to default calculation if no rows found
        const schoolDef = ANALYZER_SCHOOL_OPTIONS.find(s => s.id === schoolId);
        if (schoolDef) {
          const sRating = (schoolDef as any).rating;
          if (typeof sRating === 'number') {
            const med = getProvinceMedianRating(schoolDef.province);
            adjustmentFactor = W_S * (sRating - med);
          }
        }
      }
    } else {
      // Fallback if no Supabase
      const schoolDef = ANALYZER_SCHOOL_OPTIONS.find(s => s.id === schoolId);
      if (schoolDef) {
        const sRating = (schoolDef as any).rating;
        if (typeof sRating === 'number') {
          const med = getProvinceMedianRating(schoolDef.province);
          adjustmentFactor = W_S * (sRating - med);
        }
      }
    }

    const adjustedMark = Math.min(100, Math.max(0, numericMark + adjustmentFactor));
    
    return NextResponse.json({
      schoolId,
      originalMark: numericMark,
      adjustmentFactor: Number(adjustmentFactor.toFixed(2)),
      adjustedMark: Number(adjustedMark.toFixed(2))
    });

  } catch (error) {
    console.error('GPA Calc Error:', error);
    return NextResponse.json({ error: 'Failed to calculate' }, { status: 500 });
  }
}
