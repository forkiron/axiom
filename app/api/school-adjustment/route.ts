import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// ── School data imports ──────────────────────────────────────────────────────
import bcSchoolDataset from '../../../lib/data/bc-school-rankings.json';
import abSchoolDataset from '../../../lib/data/ab-school-rankings.json';
import qcSchoolDataset from '../../../lib/data/qc-school-rankings.json';

const ADJUSTMENTS_FILE = path.join(process.cwd(), 'lib', 'data', 'school-adjustments.json');

// ── Formula constants ────────────────────────────────────────────────────────
const W_D = 2;      // difficulty weight
const W_S = 1.5;    // school strength weight
const D_AVG = 5;    // national average test difficulty

// ── Types ────────────────────────────────────────────────────────────────────
interface SchoolRecord { id: string; rating: number | null; province?: string; }
interface SchoolAdjustment { adjustmentFactor: number; estimatedDifficulty: number; mAdj?: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAllSchools(): SchoolRecord[] {
  return [
    ...(bcSchoolDataset as any).schools,
    ...(abSchoolDataset as any).schools,
    ...(qcSchoolDataset as any).schools,
  ] as SchoolRecord[];
}

function getProvinceMedianRating(province: string): number {
  const schools = getAllSchools().filter(
    s => s.province?.toUpperCase() === province.toUpperCase() && s.rating != null
  );
  if (schools.length === 0) return 5; // fallback
  const ratings = schools.map(s => s.rating as number).sort((a, b) => a - b);
  const mid = Math.floor(ratings.length / 2);
  return ratings.length % 2 === 0
    ? (ratings[mid - 1] + ratings[mid]) / 2
    : ratings[mid];
}

/**
 * M_adj = M + w_d*(Dt - D_avg) + w_s*(S - S_avg)
 * adjustmentFactor = M_adj - M  (clamped so M_adj stays 0-100)
 */
function computeAdjustment(
  classAverage: number,
  estimatedDifficulty: number,
  schoolRating: number,
  provinceMedianRating: number
): { adjustmentFactor: number; mAdj: number } {
  const difficultyBonus = W_D * (estimatedDifficulty - D_AVG);
  const schoolBonus = W_S * (schoolRating - provinceMedianRating);
  const mAdj = Math.min(100, Math.max(0, classAverage + difficultyBonus + schoolBonus));
  const adjustmentFactor = parseFloat((mAdj - classAverage).toFixed(2));
  return { adjustmentFactor, mAdj: parseFloat(mAdj.toFixed(2)) };
}

async function readAdjustments(): Promise<Record<string, SchoolAdjustment>> {
  try {
    const raw = await fs.readFile(ADJUSTMENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // Handle old format (plain number) transparently
    const result: Record<string, SchoolAdjustment> = {};
    for (const [id, val] of Object.entries(parsed)) {
      if (typeof val === 'number') {
        result[id] = { adjustmentFactor: val, estimatedDifficulty: D_AVG };
      } else {
        result[id] = val as SchoolAdjustment;
      }
    }
    return result;
  } catch {
    return {};
  }
}

async function writeAdjustments(data: Record<string, SchoolAdjustment>): Promise<void> {
  await fs.writeFile(ADJUSTMENTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── GET — return all adjustments (keyed by schoolId) ────────────────────────
export async function GET() {
  const adjustments = await readAdjustments();
  return NextResponse.json(adjustments);
}

// ── POST — compute formula and save ─────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      schoolId,
      estimatedDifficulty,
      classAverage,
      province,
    } = body;

    if (!schoolId) {
      return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });
    }

    // Look up the school's strength rating
    const allSchools = getAllSchools();
    const school = allSchools.find(s => s.id === schoolId);
    const schoolRating = school?.rating ?? null;

    // Dt: use provided estimatedDifficulty, or stored difficulty, or fallback D_AVG
    const adjustments = await readAdjustments();
    const storedDifficulty = adjustments[schoolId]?.estimatedDifficulty ?? D_AVG;
    const Dt: number = typeof estimatedDifficulty === 'number' ? estimatedDifficulty : storedDifficulty;

    // M: class average
    const M: number = typeof classAverage === 'number' ? classAverage : 75;

    // S_avg: median school rating for this province
    const schoolProvince = province ?? school?.province ?? 'BC';
    const S_avg = getProvinceMedianRating(schoolProvince);

    // S: school rating, fallback to S_avg (so school adjustment = 0 if unknown)
    const S: number = schoolRating ?? S_avg;

    // Apply formula
    const { adjustmentFactor, mAdj } = computeAdjustment(M, Dt, S, S_avg);

    // Persist
    adjustments[schoolId] = { adjustmentFactor, estimatedDifficulty: Dt, mAdj };
    await writeAdjustments(adjustments);

    return NextResponse.json({
      success: true,
      schoolId,
      adjustmentFactor,
      estimatedDifficulty: Dt,
      mAdj,
      schoolRating: S,
      provinceMedianRating: S_avg,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save adjustment' },
      { status: 500 }
    );
  }
}
