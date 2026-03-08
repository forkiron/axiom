import bcSchoolDataset from './data/bc-school-rankings.json';
import abSchoolDataset from './data/ab-school-rankings.json';
import qcSchoolDataset from './data/qc-school-rankings.json';
import nbSchoolDataset from './data/nb-school-rankings.json';
import onSchoolDataset from './data/on-school-rankings.json';

export type ProvinceCode = 'BC' | 'AB' | 'QC' | 'NB' | 'ON';
type QueryIntent = 'list' | 'count' | 'average' | 'school';
export type SortMode = 'best' | 'worst';

interface RawSchoolRecord {
  id: string;
  schoolName: string;
  city: string;
  province: ProvinceCode;
  rank: number | null;
  rating: number | null;
  rating5yr?: number | null;
  latitude: number;
  longitude: number;
}

interface SchoolDatasetFile {
  schools: RawSchoolRecord[];
}

interface IndexedSchoolRecord extends RawSchoolRecord {
  normalizedName: string;
  normalizedCity: string;
  normalizedProvince: string;
}

interface ParsedQuery {
  intent: QueryIntent;
  city: string | null;
  province: ProvinceCode | null;
  schoolName: string | null;
  minRating: number | null;
  maxRating: number | null;
  limit: number;
  sort: SortMode;
}

export interface SchoolAgentContext {
  city: string | null;
  province: ProvinceCode | null;
  minRating: number | null;
  maxRating: number | null;
  limit: number;
  sort: SortMode;
}

export interface SchoolAgentSchoolResult {
  id: string;
  schoolName: string;
  city: string;
  province: ProvinceCode;
  rating: number | null;
  rank: number | null;
  rating5yr: number | null;
}

const DATASET_LIMITATIONS = [
  'Dataset is ranking/rating focused and does not include tuition, admissions selectivity, commute time, or extracurricular depth for each school.',
  'Use results as an academic shortlist, then refine by budget, school type (public/private), and program fit.',
];

export interface SchoolAgentResult {
  answer: string;
  context: SchoolAgentContext;
  appliedFilters: {
    intent: QueryIntent;
    city: string | null;
    province: ProvinceCode | null;
    schoolName: string | null;
    minRating: number | null;
    maxRating: number | null;
    sort: SortMode;
    limit: number;
  };
  results: SchoolAgentSchoolResult[];
  meta: {
    intent: QueryIntent;
    totalMatched: number;
    shown: number;
    coverage: string;
  };
}

export interface SearchSchoolsArgs {
  city?: string;
  province?: string;
  schoolNameQuery?: string;
  minRating?: number;
  maxRating?: number;
  sort?: SortMode;
  limit?: number;
}

export interface SchoolDetailsArgs {
  schoolName: string;
  city?: string;
  province?: string;
}

export interface CompareSchoolsArgs {
  schoolNames: string[];
}

interface SchoolSearchFilters {
  city: string | null;
  province: ProvinceCode | null;
  schoolNameQuery: string | null;
  minRating: number | null;
  maxRating: number | null;
  sort: SortMode;
  limit: number;
}

interface SchoolSearchFilterInput {
  city?: string | null;
  province?: string | ProvinceCode | null;
  schoolNameQuery?: string | null;
  minRating?: number | null;
  maxRating?: number | null;
  sort?: SortMode | null;
  limit?: number | null;
}

const PROVINCE_LABELS: Record<ProvinceCode, string> = {
  BC: 'British Columbia',
  AB: 'Alberta',
  QC: 'Quebec',
  NB: 'New Brunswick',
  ON: 'Ontario',
};

const PROVINCE_ALIASES: Array<[string, ProvinceCode]> = [
  ['british columbia', 'BC'],
  ['b c', 'BC'],
  ['bc', 'BC'],
  ['alberta', 'AB'],
  ['ab', 'AB'],
  ['quebec', 'QC'],
  ['quebec province', 'QC'],
  ['qc', 'QC'],
  ['new brunswick', 'NB'],
  ['nb', 'NB'],
  ['ontario', 'ON'],
  ['on', 'ON'],
]
  .map(([alias, province]) => [normalizeText(alias), province])
  .sort((a, b) => b[0].length - a[0].length) as Array<[string, ProvinceCode]>;

const COVERAGE_COUNTS = {
  BC: ((bcSchoolDataset as SchoolDatasetFile).schools ?? []).length,
  AB: ((abSchoolDataset as SchoolDatasetFile).schools ?? []).length,
  QC: ((qcSchoolDataset as SchoolDatasetFile).schools ?? []).length,
  NB: ((nbSchoolDataset as SchoolDatasetFile).schools ?? []).length,
  ON: ((onSchoolDataset as SchoolDatasetFile).schools ?? []).length,
};

export const SCHOOL_AGENT_COVERAGE = `BC (${COVERAGE_COUNTS.BC}), AB (${COVERAGE_COUNTS.AB}), QC (${COVERAGE_COUNTS.QC}), NB (${COVERAGE_COUNTS.NB}), ON (${COVERAGE_COUNTS.ON})`;

const RAW_SCHOOLS: RawSchoolRecord[] = [
  ...((bcSchoolDataset as SchoolDatasetFile).schools ?? []),
  ...((abSchoolDataset as SchoolDatasetFile).schools ?? []),
  ...((qcSchoolDataset as SchoolDatasetFile).schools ?? []),
  ...((nbSchoolDataset as SchoolDatasetFile).schools ?? []),
  ...((onSchoolDataset as SchoolDatasetFile).schools ?? []),
];

const SCHOOLS: IndexedSchoolRecord[] = RAW_SCHOOLS.map((school) => ({
  ...school,
  normalizedName: normalizeText(school.schoolName),
  normalizedCity: normalizeText(school.city),
  normalizedProvince: normalizeText(school.province),
}));

const CITY_INDEX: Array<{ normalized: string; city: string }> = Array.from(
  new Map(SCHOOLS.map((school) => [school.normalizedCity, school.city])).entries()
)
  .filter(([normalized]) => normalized.length >= 4)
  .map(([normalized, city]) => ({ normalized, city }))
  .sort((a, b) => b.normalized.length - a.normalized.length);

const SCHOOL_NAME_INDEX: Array<{ normalized: string; schoolName: string }> = Array.from(
  new Map(SCHOOLS.map((school) => [school.normalizedName, school.schoolName])).entries()
)
  .filter(([normalized]) => normalized.length >= 6)
  .map(([normalized, schoolName]) => ({ normalized, schoolName }))
  .sort((a, b) => b.normalized.length - a.normalized.length);

const CONTEXT_CUE_PATTERN = /\b(there|those|them|same|again|also|that city|that province)\b/;

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasPhrase(haystack: string, needle: string) {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseMaybeNumber(raw: string | undefined) {
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, 0, 10);
}

function detectProvince(query: string) {
  for (const [alias, province] of PROVINCE_ALIASES) {
    if (hasPhrase(query, alias)) return province;
  }
  return null;
}

function parseProvinceCode(value: string | null | undefined): ProvinceCode | null {
  if (!value) return null;
  const normalized = normalizeText(value);
  for (const [alias, province] of PROVINCE_ALIASES) {
    if (normalized === alias || hasPhrase(normalized, alias)) return province;
  }
  return null;
}

function detectCity(query: string) {
  for (const entry of CITY_INDEX) {
    if (hasPhrase(query, entry.normalized)) return entry.city;
  }
  return null;
}

function detectSchoolName(query: string) {
  for (const entry of SCHOOL_NAME_INDEX) {
    if (hasPhrase(query, entry.normalized)) return entry.schoolName;
  }
  return null;
}

function detectLimit(query: string) {
  const topMatch = query.match(/\b(?:top|best|highest|worst|lowest|bottom)\s+(\d{1,2})\b/);
  if (topMatch) return clamp(Number.parseInt(topMatch[1], 10), 1, 25);

  const countMatch = query.match(/\b(\d{1,2})\s+(?:schools?|results?)\b/);
  if (countMatch) return clamp(Number.parseInt(countMatch[1], 10), 1, 25);

  return 8;
}

function detectRatingRange(query: string) {
  let minRating: number | null = null;
  let maxRating: number | null = null;

  const betweenMatch = query.match(/\bbetween\s+(\d{1,2}(?:\.\d+)?)\s+(?:and|to)\s+(\d{1,2}(?:\.\d+)?)\b/);
  if (betweenMatch) {
    const a = parseMaybeNumber(betweenMatch[1]);
    const b = parseMaybeNumber(betweenMatch[2]);
    if (a !== null && b !== null) {
      minRating = Math.min(a, b);
      maxRating = Math.max(a, b);
    }
  }

  const minMatch =
    query.match(/\b(?:rating\s*)?(?:at least|min(?:imum)?(?:\s+of)?|>=|above|over)\s*(\d{1,2}(?:\.\d+)?)\b/) ??
    query.match(/\brating\s*(?:>=|>|from)\s*(\d{1,2}(?:\.\d+)?)\b/);
  if (minMatch) {
    const parsed = parseMaybeNumber(minMatch[1]);
    if (parsed !== null) minRating = parsed;
  }

  const maxMatch =
    query.match(/\b(?:rating\s*)?(?:at most|max(?:imum)?(?:\s+of)?|<=|below|under)\s*(\d{1,2}(?:\.\d+)?)\b/) ??
    query.match(/\brating\s*(?:<=|<)\s*(\d{1,2}(?:\.\d+)?)\b/);
  if (maxMatch) {
    const parsed = parseMaybeNumber(maxMatch[1]);
    if (parsed !== null) maxRating = parsed;
  }

  if (minRating === null && maxRating === null && /\brating\b/.test(query)) {
    const exact = query.match(/\brating\s*(?:of|is|=)?\s*(\d{1,2}(?:\.\d+)?)\b/);
    const hasComparator = /\b(at least|min(?:imum)?|above|over|at most|max(?:imum)?|below|under|between)\b/.test(
      query
    );
    if (exact && !hasComparator) {
      const parsed = parseMaybeNumber(exact[1]);
      if (parsed !== null) {
        minRating = parsed;
        maxRating = parsed;
      }
    }
  }

  return { minRating, maxRating };
}

function parseQuery(question: string, context?: SchoolAgentContext | null): ParsedQuery {
  const normalized = normalizeText(question);
  const intentCount = /\b(how many|count|number of)\b/.test(normalized);
  const intentAverage = /\b(average|avg|mean)\b/.test(normalized) && /\brating\b/.test(normalized);
  const sort: SortMode = /\b(worst|lowest|bottom)\b/.test(normalized) ? 'worst' : 'best';
  const limit = detectLimit(normalized);
  const { minRating, maxRating } = detectRatingRange(normalized);
  const directCity = detectCity(normalized);
  const directProvince = detectProvince(normalized);
  const schoolName = detectSchoolName(normalized);
  const wantsSchoolDetail =
    schoolName !== null &&
    /\b(about|details?|info|information|tell me|where is)\b/.test(normalized) &&
    !/\b(best|top|worst|highest|lowest)\b/.test(normalized);

  const shouldUseContext = CONTEXT_CUE_PATTERN.test(normalized);
  const city = directCity ?? (shouldUseContext ? context?.city ?? null : null);
  const province = directProvince ?? (shouldUseContext ? context?.province ?? null : null);

  let intent: QueryIntent = 'list';
  if (intentCount) intent = 'count';
  if (intentAverage) intent = 'average';
  if (wantsSchoolDetail) intent = 'school';

  return {
    intent,
    city,
    province,
    schoolName,
    minRating,
    maxRating,
    limit,
    sort,
  };
}

function sanitizeFilters(filters: SchoolSearchFilterInput): SchoolSearchFilters {
  const minRating =
    typeof filters.minRating === 'number' && Number.isFinite(filters.minRating)
      ? clamp(filters.minRating, 0, 10)
      : null;
  const maxRating =
    typeof filters.maxRating === 'number' && Number.isFinite(filters.maxRating)
      ? clamp(filters.maxRating, 0, 10)
      : null;

  return {
    city: filters.city ? String(filters.city).trim() : null,
    province: parseProvinceCode(filters.province ?? null),
    schoolNameQuery: filters.schoolNameQuery ? String(filters.schoolNameQuery).trim() : null,
    minRating,
    maxRating,
    sort: filters.sort === 'worst' ? 'worst' : 'best',
    limit:
      typeof filters.limit === 'number' && Number.isFinite(filters.limit)
        ? clamp(Math.floor(filters.limit), 1, 25)
        : 8,
  };
}

function filterAndSortSchools(filters: SchoolSearchFilters) {
  const normalizedCity = filters.city ? normalizeText(filters.city) : null;
  const normalizedNameQuery = filters.schoolNameQuery ? normalizeText(filters.schoolNameQuery) : null;

  let matched = SCHOOLS.filter((school) => {
    if (filters.province && school.province !== filters.province) return false;
    if (normalizedCity && school.normalizedCity !== normalizedCity) return false;
    if (normalizedNameQuery && !school.normalizedName.includes(normalizedNameQuery)) return false;

    if (filters.minRating !== null) {
      if (typeof school.rating !== 'number' || school.rating < filters.minRating) return false;
    }

    if (filters.maxRating !== null) {
      if (typeof school.rating !== 'number' || school.rating > filters.maxRating) return false;
    }

    return true;
  });

  matched = matched.slice().sort(filters.sort === 'best' ? compareByBest : compareByWorst);
  return {
    all: matched,
    shown: matched.slice(0, filters.limit),
  };
}

function compareByBest(a: IndexedSchoolRecord, b: IndexedSchoolRecord) {
  const ratingA = typeof a.rating === 'number' ? a.rating : -1;
  const ratingB = typeof b.rating === 'number' ? b.rating : -1;
  if (ratingA !== ratingB) return ratingB - ratingA;

  const rankA = typeof a.rank === 'number' ? a.rank : Number.POSITIVE_INFINITY;
  const rankB = typeof b.rank === 'number' ? b.rank : Number.POSITIVE_INFINITY;
  if (rankA !== rankB) return rankA - rankB;

  return a.schoolName.localeCompare(b.schoolName);
}

function compareByWorst(a: IndexedSchoolRecord, b: IndexedSchoolRecord) {
  const ratingA = typeof a.rating === 'number' ? a.rating : Number.POSITIVE_INFINITY;
  const ratingB = typeof b.rating === 'number' ? b.rating : Number.POSITIVE_INFINITY;
  if (ratingA !== ratingB) return ratingA - ratingB;

  const rankA = typeof a.rank === 'number' ? a.rank : -1;
  const rankB = typeof b.rank === 'number' ? b.rank : -1;
  if (rankA !== rankB) return rankB - rankA;

  return a.schoolName.localeCompare(b.schoolName);
}

function describeScope(parsed: ParsedQuery) {
  const parts: string[] = [];
  if (parsed.city) parts.push(`city=${parsed.city}`);
  if (parsed.province) parts.push(`province=${parsed.province}`);
  if (parsed.schoolName) parts.push(`school contains "${parsed.schoolName}"`);
  if (parsed.minRating !== null) parts.push(`rating >= ${parsed.minRating}`);
  if (parsed.maxRating !== null) parts.push(`rating <= ${parsed.maxRating}`);

  if (parts.length === 0) {
    return `all schools in current coverage (${SCHOOL_AGENT_COVERAGE})`;
  }
  return parts.join(', ');
}

function formatSchoolRow(school: IndexedSchoolRecord, index: number) {
  const ratingLabel = typeof school.rating === 'number' ? school.rating.toFixed(1) : 'N/A';
  const rankLabel = typeof school.rank === 'number' ? `#${school.rank}` : 'N/A';
  return `${index + 1}. ${school.schoolName} (${school.city}, ${school.province}) - rating ${ratingLabel}/10, rank ${rankLabel}`;
}

function formatResultRecord(school: IndexedSchoolRecord): SchoolAgentSchoolResult {
  return {
    id: school.id,
    schoolName: school.schoolName,
    city: school.city,
    province: school.province,
    rating: school.rating,
    rank: school.rank,
    rating5yr: school.rating5yr ?? null,
  };
}

export function runSchoolAgentQuery(question: string, context?: SchoolAgentContext | null): SchoolAgentResult {
  const parsed = parseQuery(question, context);
  const filters = sanitizeFilters({
    city: parsed.city,
    province: parsed.province,
    schoolNameQuery: parsed.schoolName,
    minRating: parsed.minRating,
    maxRating: parsed.maxRating,
    sort: parsed.sort,
    limit: parsed.limit,
  });
  const { all: matched, shown } = filterAndSortSchools(filters);
  const contextOut: SchoolAgentContext = {
    city: parsed.city,
    province: parsed.province,
    minRating: parsed.minRating,
    maxRating: parsed.maxRating,
    sort: parsed.sort,
    limit: parsed.limit,
  };

  if (matched.length === 0) {
    return {
      answer: `No schools matched your query (${describeScope(parsed)}). Current dataset coverage is ${SCHOOL_AGENT_COVERAGE}. Try a wider filter or a specific city in BC, AB, QC, NB, or ON.`,
      context: contextOut,
      appliedFilters: {
        intent: parsed.intent,
        city: parsed.city,
        province: parsed.province,
        schoolName: parsed.schoolName,
        minRating: parsed.minRating,
        maxRating: parsed.maxRating,
        sort: parsed.sort,
        limit: parsed.limit,
      },
      results: [],
      meta: {
        intent: parsed.intent,
        totalMatched: 0,
        shown: 0,
        coverage: SCHOOL_AGENT_COVERAGE,
      },
    };
  }

  if (parsed.intent === 'count') {
    return {
      answer: `I found ${matched.length} schools for ${describeScope(parsed)}.`,
      context: contextOut,
      appliedFilters: {
        intent: parsed.intent,
        city: parsed.city,
        province: parsed.province,
        schoolName: parsed.schoolName,
        minRating: parsed.minRating,
        maxRating: parsed.maxRating,
        sort: parsed.sort,
        limit: parsed.limit,
      },
      results: shown.map(formatResultRecord),
      meta: {
        intent: parsed.intent,
        totalMatched: matched.length,
        shown: shown.length,
        coverage: SCHOOL_AGENT_COVERAGE,
      },
    };
  }

  if (parsed.intent === 'average') {
    const ratings = matched.map((school) => school.rating).filter((rating): rating is number => typeof rating === 'number');
    const average = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
    const answer =
      average === null
        ? `I found ${matched.length} schools, but none of them have a numeric rating in this subset.`
        : `Average rating across ${matched.length} matched schools is ${average.toFixed(2)}/10.`;

    return {
      answer,
      context: contextOut,
      appliedFilters: {
        intent: parsed.intent,
        city: parsed.city,
        province: parsed.province,
        schoolName: parsed.schoolName,
        minRating: parsed.minRating,
        maxRating: parsed.maxRating,
        sort: parsed.sort,
        limit: parsed.limit,
      },
      results: shown.map(formatResultRecord),
      meta: {
        intent: parsed.intent,
        totalMatched: matched.length,
        shown: shown.length,
        coverage: SCHOOL_AGENT_COVERAGE,
      },
    };
  }

  if (parsed.intent === 'school') {
    const school = matched[0];
    const ratingLabel = typeof school.rating === 'number' ? `${school.rating.toFixed(1)}/10` : 'N/A';
    const rankLabel = typeof school.rank === 'number' ? `#${school.rank}` : 'N/A';
    const provinceLabel = PROVINCE_LABELS[school.province] ?? school.province;
    const answer = `${school.schoolName} is in ${school.city}, ${provinceLabel}. Current rating is ${ratingLabel} and provincial rank is ${rankLabel}.`;

    return {
      answer,
      context: contextOut,
      appliedFilters: {
        intent: parsed.intent,
        city: parsed.city,
        province: parsed.province,
        schoolName: parsed.schoolName,
        minRating: parsed.minRating,
        maxRating: parsed.maxRating,
        sort: parsed.sort,
        limit: parsed.limit,
      },
      results: [formatResultRecord(school)],
      meta: {
        intent: parsed.intent,
        totalMatched: matched.length,
        shown: 1,
        coverage: SCHOOL_AGENT_COVERAGE,
      },
    };
  }

  const rankingLabel = parsed.sort === 'best' ? 'Top' : 'Bottom';
  const lines = shown.map((school, index) => formatSchoolRow(school, index));
  const answer = `${rankingLabel} ${shown.length} schools for ${describeScope(parsed)}:\n${lines.join('\n')}`;

  return {
    answer,
    context: contextOut,
    appliedFilters: {
      intent: parsed.intent,
      city: parsed.city,
      province: parsed.province,
      schoolName: parsed.schoolName,
      minRating: parsed.minRating,
      maxRating: parsed.maxRating,
      sort: parsed.sort,
      limit: parsed.limit,
    },
    results: shown.map(formatResultRecord),
    meta: {
      intent: parsed.intent,
      totalMatched: matched.length,
      shown: shown.length,
      coverage: SCHOOL_AGENT_COVERAGE,
    },
  };
}

export function searchSchools(args: SearchSchoolsArgs) {
  const filters = sanitizeFilters({
    city: args.city ?? null,
    province: args.province ?? null,
    schoolNameQuery: args.schoolNameQuery ?? null,
    minRating: typeof args.minRating === 'number' ? args.minRating : null,
    maxRating: typeof args.maxRating === 'number' ? args.maxRating : null,
    sort: args.sort,
    limit: args.limit,
  });
  const { all, shown } = filterAndSortSchools(filters);

  return {
    filters: {
      city: filters.city,
      province: filters.province,
      schoolNameQuery: filters.schoolNameQuery,
      minRating: filters.minRating,
      maxRating: filters.maxRating,
      sort: filters.sort,
      limit: filters.limit,
    },
    totalMatched: all.length,
    results: shown.map(formatResultRecord),
    coverage: SCHOOL_AGENT_COVERAGE,
    limitations: DATASET_LIMITATIONS,
  };
}

export function getSchoolDetails(args: SchoolDetailsArgs) {
  const schoolName = normalizeText(args.schoolName ?? '');
  if (!schoolName) {
    return {
      found: false,
      error: 'schoolName is required',
      coverage: SCHOOL_AGENT_COVERAGE,
    };
  }

  const province = parseProvinceCode(args.province ?? null);
  const city = args.city ? normalizeText(args.city) : null;

  const candidates = SCHOOLS.filter((school) => {
    if (province && school.province !== province) return false;
    if (city && school.normalizedCity !== city) return false;
    return school.normalizedName.includes(schoolName);
  }).sort(compareByBest);

  if (candidates.length === 0) {
    return {
      found: false,
      error: 'No school matched the provided name/filter.',
      coverage: SCHOOL_AGENT_COVERAGE,
    };
  }

  const school = candidates[0];
  return {
    found: true,
    school: formatResultRecord(school),
    candidatesFound: candidates.length,
    coverage: SCHOOL_AGENT_COVERAGE,
    limitations: DATASET_LIMITATIONS,
  };
}

export function compareSchools(args: CompareSchoolsArgs) {
  const normalizedTargets = (args.schoolNames ?? [])
    .map((value) => normalizeText(String(value)))
    .filter((value) => value.length > 0)
    .slice(0, 8);

  if (normalizedTargets.length < 2) {
    return {
      compared: [],
      error: 'Provide at least 2 school names to compare.',
      coverage: SCHOOL_AGENT_COVERAGE,
    };
  }

  const selected: IndexedSchoolRecord[] = [];
  const notFound: string[] = [];

  for (const target of normalizedTargets) {
    const match = SCHOOLS.filter((school) => school.normalizedName.includes(target)).sort(compareByBest)[0];
    if (match) {
      selected.push(match);
    } else {
      notFound.push(target);
    }
  }

  const compared = selected
    .slice()
    .sort(compareByBest)
    .map((school, index) => ({
      position: index + 1,
      ...formatResultRecord(school),
    }));

  return {
    compared,
    notFound,
    coverage: SCHOOL_AGENT_COVERAGE,
    limitations: DATASET_LIMITATIONS,
  };
}
