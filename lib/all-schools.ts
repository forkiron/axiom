import abSchoolRankings from '@/lib/data/ab-school-rankings.json';
import bcSchoolRankings from '@/lib/data/bc-school-rankings.json';
import nbSchoolRankings from '@/lib/data/nb-school-rankings.json';
import onSchoolRankings from '@/lib/data/on-school-rankings.json';
import qcSchoolRankings from '@/lib/data/qc-school-rankings.json';
import nlSchoolRankings from '@/lib/data/nl-school-rankings.json';
import nsSchoolRankings from '@/lib/data/ns-school-rankings.json';
import peiSchoolRankings from '@/lib/data/pei-school-rankings.json';
import mbSchoolRankings from '@/lib/data/mb-school-rankings.json';
import skSchoolRankings from '@/lib/data/sk-school-rankings.json';
import ntSchoolRankings from '@/lib/data/nt-school-rankings.json';
import ytSchoolRankings from '@/lib/data/yt-school-rankings.json';

export interface AnalyzerSchoolOption {
  id: string;
  schoolName: string;
  city: string;
  province: string;
  rating?: number;
}

function pickSchools(source: unknown): AnalyzerSchoolOption[] {
  const raw = source as { schools?: unknown[] };
  if (!Array.isArray(raw.schools)) return [];

  return (raw.schools as any[])
    .map((entry) => {
      const school = entry as {
        id?: unknown;
        schoolName?: unknown;
        city?: unknown;
        province?: unknown;
        rating?: unknown;
      };

      if (
        typeof school.id !== 'string' ||
        typeof school.schoolName !== 'string' ||
        typeof school.city !== 'string' ||
        typeof school.province !== 'string'
      ) {
        return null;
      }

      return {
        id: school.id,
        schoolName: school.schoolName,
        city: school.city,
        province: school.province,
        rating: typeof school.rating === 'number' ? school.rating : undefined,
      };
    })
    .filter((school: any): school is AnalyzerSchoolOption => school !== null) as AnalyzerSchoolOption[];
}

export const ANALYZER_SCHOOL_OPTIONS: AnalyzerSchoolOption[] = [
  ...pickSchools(abSchoolRankings),
  ...pickSchools(bcSchoolRankings),
  ...pickSchools(nbSchoolRankings),
  ...pickSchools(onSchoolRankings),
  ...pickSchools(qcSchoolRankings),
  ...pickSchools(nlSchoolRankings),
  ...pickSchools(nsSchoolRankings),
  ...pickSchools(peiSchoolRankings),
  ...pickSchools(mbSchoolRankings),
  ...pickSchools(skSchoolRankings),
  ...pickSchools(ntSchoolRankings),
  ...pickSchools(ytSchoolRankings),
];
