import fs from 'node:fs';

const INPUT_CSV = 'data/csv/provincial/bc_252_schools_2019.csv';
const OUTPUT_JSON = 'lib/data/bc-school-rankings.json';
const CITY_CENTROIDS_PATH = 'lib/data/bc-city-centroids.json';
const CACHE_JSON = 'lib/data/bc-school-geocodes.json';
const REQUEST_DELAY_MS = Number(process.env.BC_SCHOOL_GEOCODE_DELAY_MS ?? '900');

const CITY_ANCHORS = {
  Vancouver: [49.2827, -123.1207],
  Burnaby: [49.2488, -122.9805],
  Surrey: [49.1913, -122.849],
  Richmond: [49.1666, -123.1336],
  Coquitlam: [49.2838, -122.7932],
  'Port Coquitlam': [49.2625, -122.7813],
  'Port Moody': [49.283, -122.8286],
  'North Vancouver': [49.3208, -123.0722],
  'West Vancouver': [49.3282, -123.1602],
  'New Westminster': [49.2057, -122.911],
  Langley: [49.1044, -122.6604],
  Abbotsford: [49.0504, -122.3045],
  Chilliwack: [49.1579, -121.9515],
  Victoria: [48.4284, -123.3656],
  Nanaimo: [49.1659, -123.9401],
  Kelowna: [49.888, -119.496],
  Kamloops: [50.6745, -120.3273],
  'Prince George': [53.9171, -122.7497],
  'Prince Rupert': [54.3126, -130.3208],
  Terrace: [54.5163, -128.6035],
  Revelstoke: [50.9981, -118.1957],
  Whistler: [50.1163, -122.9574],
  Squamish: [49.7016, -123.1558],
  Penticton: [49.4991, -119.5937],
  Vernon: [50.267, -119.272],
  'Maple Ridge': [49.2194, -122.6019],
  'White Rock': [49.0253, -122.8026],
  'Port Alberni': [49.2413, -124.8055],
  'Powell River': [49.8352, -124.5237],
  Campbell: [50.0195, -125.2733],
  'Campbell River': [50.0266, -125.2446],
  Courtenay: [49.6866, -124.9936],
  Comox: [49.6721, -124.9289],
  Duncan: [48.7787, -123.7079],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function normalizeCity(city) {
  const normalized = String(city ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();

  const aliases = {
    'Fort St John': 'Fort St John',
    'Fort St James': 'Fort St James',
    Mcbride: 'McBride',
  };

  return aliases[normalized] ?? normalized;
}

function normalizeSchoolName(schoolName) {
  return String(schoolName ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\((?:[^)]+)\)\s*$/g, '')
    .trim();
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function hashUnit(input) {
  return hashString(input) / 4294967295;
}

function parseOptionalNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'n/a' || normalized === 'na' || normalized === '—' || normalized === '-') {
    return null;
  }
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadCityCentroids() {
  if (!fs.existsSync(CITY_CENTROIDS_PATH)) return new Map();
  const payload = JSON.parse(fs.readFileSync(CITY_CENTROIDS_PATH, 'utf8'));
  const rows = payload?.cities ?? [];
  return new Map(rows.map((row) => [normalizeCity(row.city), [row.latitude, row.longitude]]));
}

function loadCache() {
  if (!fs.existsSync(CACHE_JSON)) {
    return { schools: {}, cities: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'));
  return {
    schools: parsed?.schools ?? {},
    cities: parsed?.cities ?? {},
  };
}

function saveCache(cache) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap Nominatim',
    schools: cache.schools,
    cities: cache.cities,
  };
  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(CACHE_JSON, `${JSON.stringify(payload, null, 2)}\n`);
}

function schoolCacheKey(schoolName, city) {
  return `${normalizeSchoolName(schoolName).toLowerCase()}|${normalizeCity(city).toLowerCase()}`;
}

function cityCacheKey(city) {
  return normalizeCity(city).toLowerCase();
}

function hasLatLon(row) {
  return Number.isFinite(row?.latitude) && Number.isFinite(row?.longitude);
}

function isInBritishColumbia(result) {
  const haystack = [
    result?.display_name,
    result?.address?.state,
    result?.address?.province,
    result?.address?.county,
    result?.address?.state_district,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes('british columbia') || /\bbc\b/.test(haystack);
}

function scoreSchoolCandidate(result, schoolName, city) {
  const display = String(result?.display_name ?? '').toLowerCase();
  const schoolLower = schoolName.toLowerCase();
  const cityLower = city.toLowerCase();
  const kind = `${result?.class ?? ''}:${result?.type ?? ''}`.toLowerCase();

  let score = 0;
  if (isInBritishColumbia(result)) score += 5;
  if (display.includes(cityLower)) score += 3;
  if (display.includes(schoolLower)) score += 7;

  const words = schoolLower.split(/\s+/).filter((token) => token.length > 3);
  const matchedWords = words.filter((token) => display.includes(token)).length;
  score += Math.min(6, matchedWords);

  if (kind.includes('school')) score += 6;
  if (kind.includes('college') || kind.includes('university')) score += 2;
  if (display.includes('school')) score += 1;
  return score;
}

async function nominatimSearch(query, limit) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ca&limit=${limit}` +
    `&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'hackcanada-bc-school-geocoder/1.0 (hackathon project)',
        'accept-language': 'en',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        await sleep(2400);
      }
      return [];
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload;
  } catch {
    return [];
  }
}

function getHashedProvinceFallback(city) {
  const uLat = hashUnit(`lat:${city}`);
  const uLon = hashUnit(`lon:${city}`);
  const lat = 48.1 + uLat * 11.7;
  const lon = -138.9 + uLon * 24.6;
  return [lat, lon];
}

async function geocodeCity(city, centroidMap) {
  const queries = [`${city}, British Columbia, Canada`, `${city}, BC, Canada`];

  for (const query of queries) {
    const results = await nominatimSearch(query, 3);
    const candidate = results.find((item) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && isInBritishColumbia(item);
    });

    if (candidate) {
      return {
        latitude: Number(Number(candidate.lat).toFixed(6)),
        longitude: Number(Number(candidate.lon).toFixed(6)),
        coordinateSource: 'geocoded-city+jitter',
        displayName: candidate.display_name ?? null,
        sourceQuery: query,
      };
    }

    await sleep(140);
  }

  const centroid = centroidMap.get(city);
  if (centroid) {
    const [latitude, longitude] = centroid;
    return {
      latitude,
      longitude,
      coordinateSource: 'city-centroid+jitter',
      displayName: null,
      sourceQuery: null,
    };
  }

  if (CITY_ANCHORS[city]) {
    const [latitude, longitude] = CITY_ANCHORS[city];
    return {
      latitude,
      longitude,
      coordinateSource: 'city-anchor+jitter',
      displayName: null,
      sourceQuery: null,
    };
  }

  const [latitude, longitude] = getHashedProvinceFallback(city);
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    coordinateSource: 'city-hash+jitter',
    displayName: null,
    sourceQuery: null,
  };
}

async function geocodeSchool(schoolName, city) {
  const queries = [
    `${schoolName}, ${city}, British Columbia, Canada`,
    `${schoolName} School, ${city}, British Columbia, Canada`,
    `${schoolName} Secondary School, ${city}, British Columbia, Canada`,
    `${schoolName} High School, ${city}, British Columbia, Canada`,
    `${schoolName}, ${city}, BC, Canada`,
    `${schoolName}, British Columbia, Canada`,
  ];

  let bestCandidate = null;
  let bestScore = -1;
  let bestQuery = null;

  for (const query of queries) {
    const results = await nominatimSearch(query, 6);
    for (const result of results) {
      const lat = Number(result?.lat);
      const lon = Number(result?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const score = scoreSchoolCandidate(result, schoolName, city);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = result;
        bestQuery = query;
      }
    }

    if (bestScore >= 12 && bestCandidate) {
      return {
        latitude: Number(Number(bestCandidate.lat).toFixed(6)),
        longitude: Number(Number(bestCandidate.lon).toFixed(6)),
        coordinateSource: 'geocoded-school',
        geocodeScore: bestScore,
        displayName: bestCandidate.display_name ?? null,
        sourceQuery: bestQuery,
      };
    }

    await sleep(160);
  }

  if (bestCandidate && bestScore >= 8) {
    return {
      latitude: Number(Number(bestCandidate.lat).toFixed(6)),
      longitude: Number(Number(bestCandidate.lon).toFixed(6)),
      coordinateSource: 'geocoded-school',
      geocodeScore: bestScore,
      displayName: bestCandidate.display_name ?? null,
      sourceQuery: bestQuery,
    };
  }

  return null;
}

function getJitteredCoordinates(baseLat, baseLon, schoolName) {
  const u1 = hashUnit(`school-lat:${schoolName}`) - 0.5;
  const u2 = hashUnit(`school-lon:${schoolName}`) - 0.5;
  const lat = baseLat + u1 * 0.12;
  const lon = baseLon + u2 * 0.16;
  return [Number(lat.toFixed(6)), Number(lon.toFixed(6))];
}

function readRows(centroidMap) {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);

  const col = (name) => headers.indexOf(name);
  const colAny = (...names) => names.map((name) => col(name)).find((index) => index !== -1) ?? -1;
  const schoolNameCol = colAny('school_name', 'School Name');
  const cityCol = colAny('city', 'City');
  const ratingCol = colAny('overall_rating_2023_2024', 'overall_rating_2019', 'Overall Rating');
  const rating5yrCol = colAny('overall_rating_5yr', 'overall_rating_5_year', 'Overall Rating 5yr');
  const rankCol = colAny('rank_2023_2024', 'rank_2019', 'Provincial Rank');

  if (schoolNameCol === -1 || cityCol === -1) {
    throw new Error('Missing required columns: expected school_name and city');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const schoolName = normalizeSchoolName(row[schoolNameCol] ?? '');
    const cityRaw = row[cityCol]?.trim();
    if (!schoolName || !cityRaw) continue;

    const city = normalizeCity(cityRaw);
    rows.push({
      schoolName,
      city,
      rank: parseOptionalNumber(rankCol === -1 ? null : row[rankCol]),
      rating: parseOptionalNumber(ratingCol === -1 ? null : row[ratingCol]),
      rating5yr: parseOptionalNumber(rating5yrCol === -1 ? null : row[rating5yrCol]),
      hasRealCityCentroid: centroidMap.has(city),
    });
  }

  return rows;
}

async function buildBcSchoolMapData() {
  const centroidMap = loadCityCentroids();
  const rows = readRows(centroidMap);
  const cache = loadCache();
  const schools = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const schoolKey = schoolCacheKey(row.schoolName, row.city);
    const cityKey = cityCacheKey(row.city);
    let resolved = cache.schools[schoolKey];

    if (!hasLatLon(resolved)) {
      resolved = await geocodeSchool(row.schoolName, row.city);
      if (resolved) {
        cache.schools[schoolKey] = resolved;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    if (!hasLatLon(resolved)) {
      let cityCoord = cache.cities[cityKey];
      if (!hasLatLon(cityCoord)) {
        cityCoord = await geocodeCity(row.city, centroidMap);
        cache.cities[cityKey] = cityCoord;
        await sleep(REQUEST_DELAY_MS);
      }

      const [latitude, longitude] = getJitteredCoordinates(
        cityCoord.latitude,
        cityCoord.longitude,
        `${row.schoolName}:${row.city}`
      );
      resolved = {
        latitude,
        longitude,
        coordinateSource: cityCoord.coordinateSource,
        geocodeScore: null,
        displayName: cityCoord.displayName ?? null,
        sourceQuery: cityCoord.sourceQuery ?? null,
      };
      cache.schools[schoolKey] = resolved;
    }

    schools.push({
      id: `bc-${hashString(`${row.schoolName}:${row.city}`).toString(36)}`,
      schoolName: row.schoolName,
      city: row.city,
      province: 'BC',
      rank: row.rank,
      rating: row.rating,
      rating5yr: row.rating5yr,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      coordinateSource: resolved.coordinateSource,
      geocodeScore: resolved.geocodeScore ?? null,
      hasRealCityCentroid: row.hasRealCityCentroid,
    });

    process.stdout.write(
      `Processed ${i + 1}/${rows.length}: ${row.schoolName} (${row.city}) [${resolved.coordinateSource}]\n`
    );
  }

  saveCache(cache);

  const geocodedSchoolCount = schools.filter((school) => school.coordinateSource === 'geocoded-school').length;
  const fallbackCount = schools.length - geocodedSchoolCount;
  const sourceBreakdown = schools.reduce((acc, school) => {
    acc[school.coordinateSource] = (acc[school.coordinateSource] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    notes:
      'Coordinates are geocoded per school when available; unresolved schools fall back to city centroid/anchor plus deterministic jitter.',
    count: schools.length,
    geocodedSchoolCount,
    fallbackCount,
    sourceBreakdown,
    schools,
  };
}

const payload = await buildBcSchoolMapData();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.count} BC schools to ${OUTPUT_JSON}`);
console.log(
  `Geocoded schools: ${payload.geocodedSchoolCount}, fallback schools: ${payload.fallbackCount}`
);
console.log(`Source breakdown: ${JSON.stringify(payload.sourceBreakdown)}`);
