import { NextResponse } from 'next/server';

import abSchoolDataset from '@/lib/data/ab-school-rankings.json';
import bcSchoolDataset from '@/lib/data/bc-school-rankings.json';
import nbSchoolDataset from '@/lib/data/nb-school-rankings.json';
import qcSchoolDataset from '@/lib/data/qc-school-rankings.json';
import onSchoolDataset from '@/lib/data/on-school-rankings.json';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const W_D = 2;
const W_S = 1.5;
const D_AVG = 5;

type SchoolRecord = {
  id: string;
  rating: number | null;
  province?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAllSchools(): SchoolRecord[] {
  const pick = (payload: unknown) => {
    const raw = payload as { schools?: unknown[] };
    return Array.isArray(raw.schools) ? raw.schools : [];
  };

  return [
    ...pick(bcSchoolDataset),
    ...pick(abSchoolDataset),
    ...pick(qcSchoolDataset),
    ...pick(nbSchoolDataset),
    ...pick(onSchoolDataset),
  ] as SchoolRecord[];
}

function getProvinceMedianRating(province: string): number {
  const target = province.toUpperCase();
  const ratings = getAllSchools()
    .filter((school) => school.province?.toUpperCase() === target && school.rating != null)
    .map((school) => Number(school.rating))
    .filter((rating) => Number.isFinite(rating))
    .sort((a, b) => a - b);

  if (ratings.length === 0) return 5;

  const mid = Math.floor(ratings.length / 2);
  return ratings.length % 2 === 0 ? (ratings[mid - 1] + ratings[mid]) / 2 : ratings[mid];
}

function computeAdjustment(
  classAverage: number,
  estimatedDifficulty: number,
  schoolRating: number,
  provinceMedianRating: number
) {
  const difficultyBonus = W_D * (estimatedDifficulty - D_AVG);
  const schoolBonus = W_S * (schoolRating - provinceMedianRating);
  const mAdj = clamp(classAverage + difficultyBonus + schoolBonus, 0, 100);
  const adjustmentFactor = mAdj - classAverage;

  return {
    adjustmentFactor: Number(adjustmentFactor.toFixed(2)),
    mAdj: Number(mAdj.toFixed(2)),
  };
}

/** GET: returns { values: { [schoolId]: weightedAverage }, counts: { [schoolId]: N } } */
export async function GET() {
  if (!hasSupabase()) {
    return NextResponse.json({ values: {}, counts: {} });
  }

  try {
    const supabase = getSupabaseAdmin();
    const withDifficulty = await supabase
      .from('school_adjustment_submissions')
      .select('school_id, adjustment_factor, estimated_difficulty, weight');

    let rows = withDifficulty.data as
      | Array<{
          school_id: string;
          adjustment_factor: number;
          estimated_difficulty?: number | null;
          weight?: number | null;
        }>
      | null;
    let error = withDifficulty.error;

    // Backward compatibility: column may not exist yet before migration runs.
    if (error && String(error.message ?? '').includes('estimated_difficulty')) {
      const withoutDifficulty = await supabase
        .from('school_adjustment_submissions')
        .select('school_id, adjustment_factor, weight');
      rows = withoutDifficulty.data as
        | Array<{
            school_id: string;
            adjustment_factor: number;
            weight?: number | null;
          }>
        | null;
      error = withoutDifficulty.error;
    }

    if (error) {
      console.error('[school-adjustment] GET error:', error);
      return NextResponse.json({ values: {}, counts: {} }, { status: 500 });
    }

    const bySchool = new Map<
      string,
      { sumAdjustment: number; totalWeight: number; sumDifficulty: number; totalDifficultyWeight: number }
    >();

    for (const row of rows ?? []) {
      const schoolId = String(row.school_id);
      const factor = Number(row.adjustment_factor);
      const weight = Number(row.weight) || 1;
      const estimatedDifficulty = Number((row as { estimated_difficulty?: unknown }).estimated_difficulty);
      const current = bySchool.get(schoolId) ?? {
        sumAdjustment: 0,
        totalWeight: 0,
        sumDifficulty: 0,
        totalDifficultyWeight: 0,
      };

      current.sumAdjustment += factor * weight;
      current.totalWeight += weight;
      if (Number.isFinite(estimatedDifficulty)) {
        current.sumDifficulty += estimatedDifficulty * weight;
        current.totalDifficultyWeight += weight;
      }
      bySchool.set(schoolId, current);
    }

    const allSchools = getAllSchools();
    const provinceRatingBuckets = new Map<string, number[]>();

    for (const school of allSchools) {
      if (typeof school.rating !== 'number' || !Number.isFinite(school.rating)) continue;
      const province = (school.province ?? 'BC').toUpperCase();
      const bucket = provinceRatingBuckets.get(province) ?? [];
      bucket.push(school.rating);
      provinceRatingBuckets.set(province, bucket);
    }

    const provinceMedians = new Map<string, number>();
    for (const [province, ratings] of provinceRatingBuckets.entries()) {
      ratings.sort((a, b) => a - b);
      const mid = Math.floor(ratings.length / 2);
      const median = ratings.length % 2 === 0 ? (ratings[mid - 1] + ratings[mid]) / 2 : ratings[mid];
      provinceMedians.set(province, median);
    }

    const values: Record<string, { adjustmentFactor: number; estimatedDifficulty: number; isDefault: false }> = {};
    const counts: Record<string, number> = {};

    for (const [schoolId, aggregates] of bySchool) {
      const adjustmentFactor =
        aggregates.totalWeight > 0 ? Number((aggregates.sumAdjustment / aggregates.totalWeight).toFixed(2)) : 0;
      const school = allSchools.find((entry) => entry.id === schoolId);
      const province = (school?.province ?? 'BC').toUpperCase();
      const provinceMedian = provinceMedians.get(province) ?? 5;
      const schoolRating =
        typeof school?.rating === 'number' && Number.isFinite(school.rating) ? school.rating : provinceMedian;

      const averagedDifficulty =
        aggregates.totalDifficultyWeight > 0
          ? clamp(aggregates.sumDifficulty / aggregates.totalDifficultyWeight, 1, 10)
          : // Infer when old rows have no stored difficulty.
            clamp(D_AVG + (adjustmentFactor - W_S * (schoolRating - provinceMedian)) / W_D, 1, 10);

      values[schoolId] = {
        adjustmentFactor,
        estimatedDifficulty: Number(averagedDifficulty.toFixed(2)),
        isDefault: false,
      };
      counts[schoolId] = Math.round(aggregates.totalWeight);
    }

    return NextResponse.json({ values, counts });
  } catch (error) {
    console.error('[school-adjustment] GET', error);
    return NextResponse.json({ values: {}, counts: {} }, { status: 500 });
  }
}

/** POST: compute formula-derived adjustment and store one submission row */
export async function POST(request: Request) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: {
    schoolId?: string;
    estimatedDifficulty?: number;
    classAverage?: number;
    province?: string;
    weight?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });
  }

  const estimatedDifficulty =
    typeof body.estimatedDifficulty === 'number' && Number.isFinite(body.estimatedDifficulty)
      ? clamp(body.estimatedDifficulty, 1, 10)
      : D_AVG;

  const classAverage =
    typeof body.classAverage === 'number' && Number.isFinite(body.classAverage)
      ? clamp(body.classAverage, 0, 100)
      : 75;

  const weight =
    typeof body.weight === 'number' && Number.isFinite(body.weight) && body.weight > 0 ? body.weight : 1;

  const schools = getAllSchools();
  const school = schools.find((entry) => entry.id === schoolId);
  const province = (typeof body.province === 'string' && body.province.trim()) || school?.province || 'BC';

  const provinceMedianRating = getProvinceMedianRating(province);
  const schoolRating = school?.rating ?? provinceMedianRating;
  const { adjustmentFactor, mAdj } = computeAdjustment(
    classAverage,
    estimatedDifficulty,
    schoolRating,
    provinceMedianRating
  );

  try {
    const supabase = getSupabaseAdmin();
    const payload = {
      school_id: schoolId,
      adjustment_factor: adjustmentFactor,
      estimated_difficulty: estimatedDifficulty,
      weight,
    };

    let { error } = await supabase.from('school_adjustment_submissions').insert(payload);

    // Backward compatibility: insert without estimated_difficulty if migration not applied yet.
    if (error && String(error.message ?? '').includes('estimated_difficulty')) {
      const fallback = await supabase.from('school_adjustment_submissions').insert({
        school_id: schoolId,
        adjustment_factor: adjustmentFactor,
        weight,
      });
      error = fallback.error;
    }

    if (error) {
      console.error('[school-adjustment] POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      schoolId,
      adjustmentFactor,
      estimatedDifficulty,
      mAdj,
      schoolRating,
      provinceMedianRating,
    });
  } catch (error) {
    console.error('[school-adjustment] POST', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
