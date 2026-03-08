import fs from 'node:fs';

const INPUT_CSV = 'ontario_747_schools.csv';
const OUTPUT_JSON = 'lib/data/on-school-rankings.json';
const CACHE_JSON = 'lib/data/on-school-geocodes.json';
const REQUEST_DELAY_MS = Number(process.env.ON_SCHOOL_GEOCODE_DELAY_MS ?? '700');

const CITY_ALIASES = {
  'St Catharines': 'Saint Catharines',
  'St. Catharines': 'Saint Catharines',
  'St Thomas': 'Saint Thomas',
  'St. Thomas': 'Saint Thomas',
  'St Marys': 'Saint Marys',
  'St. Marys': 'Saint Marys',
  'Sault Ste Marie': 'Sault Ste. Marie',
  'Sault Sainte Marie': 'Sault Ste. Marie',
  Scarborough: 'Toronto',
  Etobicoke: 'Toronto',
  NorthYork: 'North York',
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
    .replace(/\./g, '.')
    .trim();
  return CITY_ALIASES[normalized] ?? normalized;
}

function normalizeSchoolName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[’]/g, "'")
    .replace(/\s+\((?:[^)]+)\)\s*$/g, '')
    .trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseOptionalNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'n/a' || normalized === 'na' || normalized === '—' || normalized === '-') {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function makeSchoolId(schoolName, city) {
  return `on-${hashString(`${schoolName}:${city}`).toString(36)}`;
}

function schoolCacheKey(schoolName, city) {
  return `${normalizeText(normalizeSchoolName(schoolName))}|${normalizeText(normalizeCity(city))}`;
}

function cityCacheKey(city) {
  return normalizeText(normalizeCity(city));
}

function hasLatLon(row) {
  return Number.isFinite(row?.latitude) && Number.isFinite(row?.longitude);
}

function isInOntario(result) {
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
  return haystack.includes('ontario') || /\bon\b/.test(haystack);
}

function scoreSchoolCandidate(result, schoolName, city) {
  const display = String(result?.display_name ?? '').toLowerCase();
  const schoolLower = schoolName.toLowerCase();
  const cityLower = city.toLowerCase();
  const kind = `${result?.class ?? ''}:${result?.type ?? ''}`.toLowerCase();

  let score = 0;
  if (isInOntario(result)) score += 5;
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

function parseLegacyCityCache(parsed) {
  const cities = {};
  for (const row of Array.isArray(parsed?.cities) ? parsed.cities : []) {
    const key = cityCacheKey(row?.city);
    if (!key) continue;
    const latitude = Number(row?.latitude);
    const longitude = Number(row?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    cities[key] = {
      city: normalizeCity(row.city),
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      coordinateSource: row.coordinateSource ?? 'city-derived-anchor+jitter',
      sourceQuery: null,
      displayName: null,
    };
  }
  return cities;
}

function loadCache() {
  if (!fs.existsSync(CACHE_JSON)) {
    return { schools: {}, cities: {} };
  }

  const parsed = JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'));
  const schools = parsed?.schools && !Array.isArray(parsed.schools) ? parsed.schools : {};

  let cities = {};
  if (parsed?.cities && !Array.isArray(parsed.cities)) {
    cities = parsed.cities;
  } else {
    cities = parseLegacyCityCache(parsed);
  }

  return { schools, cities };
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

function getOntarioHashFallback(city) {
  const lat = 41.7 + hashUnit(`on-city-lat:${city}`) * 14.6;
  const lon = -95.2 + hashUnit(`on-city-lon:${city}`) * 20.8;
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    coordinateSource: 'city-hash+jitter',
    displayName: null,
    sourceQuery: null,
  };
}

function getJitteredCoordinates(baseLat, baseLon, schoolName) {
  const latOffset = (hashUnit(`on-school-lat:${schoolName}`) - 0.5) * 0.08;
  const lonOffset = (hashUnit(`on-school-lon:${schoolName}`) - 0.5) * 0.11;
  return {
    latitude: Number((baseLat + latOffset).toFixed(6)),
    longitude: Number((baseLon + lonOffset).toFixed(6)),
  };
}

async function nominatimSearch(query, limit) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=ca&limit=${limit}` +
    `&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'hackcanada-on-school-geocoder/1.0 (hackathon project)',
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

async function geocodeCity(city) {
  const queries = [`${city}, Ontario, Canada`, `${city}, ON, Canada`];

  for (const query of queries) {
    const results = await nominatimSearch(query, 3);
    const candidate = results.find((item) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && isInOntario(item);
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

  return null;
}

async function geocodeSchool(schoolName, city) {
  const queries = [
    `${schoolName}, ${city}, Ontario, Canada`,
    `${schoolName} School, ${city}, Ontario, Canada`,
    `${schoolName} Collegiate, ${city}, Ontario, Canada`,
    `${schoolName} Secondary School, ${city}, Ontario, Canada`,
    `${schoolName} High School, ${city}, Ontario, Canada`,
    `${schoolName}, ${city}, ON, Canada`,
    `${schoolName}, Ontario, Canada`,
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

    await sleep(140);
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

function readCsvRows() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name) => headers.indexOf(name);

  const schoolIndex = indexOf('school_name');
  const cityIndex = indexOf('city');
  const rankIndex = indexOf('rank_2024');
  const rank5yrIndex = indexOf('rank_5yr');
  const trendIndex = indexOf('trend');
  const ratingIndex = indexOf('overall_rating_2024');
  const rating5yrIndex = indexOf('overall_rating_5yr');
  const sourceIndex = indexOf('source');

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const schoolName = normalizeSchoolName(row[schoolIndex] ?? '');
    const city = normalizeCity(row[cityIndex] ?? '');
    if (!schoolName || !city) continue;

    rows.push({
      schoolName,
      city,
      rank: parseOptionalNumber(row[rankIndex]),
      rank5yr: parseOptionalNumber(row[rank5yrIndex]),
      trend: String(row[trendIndex] ?? '').trim() || null,
      rating: parseOptionalNumber(row[ratingIndex]),
      rating5yr: parseOptionalNumber(row[rating5yrIndex]),
      source: String(row[sourceIndex] ?? '').trim() || null,
    });
  }

  return rows;
}

async function buildDataset() {
  const rows = readCsvRows();
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
        const geocodedCity = await geocodeCity(row.city);
        cityCoord = geocodedCity ?? getOntarioHashFallback(row.city);
        cache.cities[cityKey] = {
          city: row.city,
          latitude: cityCoord.latitude,
          longitude: cityCoord.longitude,
          coordinateSource: cityCoord.coordinateSource,
          displayName: cityCoord.displayName ?? null,
          sourceQuery: cityCoord.sourceQuery ?? null,
        };
        await sleep(REQUEST_DELAY_MS);
      }

      const jittered = getJitteredCoordinates(
        cityCoord.latitude,
        cityCoord.longitude,
        `${row.schoolName}:${row.city}`
      );
      resolved = {
        latitude: jittered.latitude,
        longitude: jittered.longitude,
        coordinateSource: cityCoord.coordinateSource ?? 'city-derived-anchor+jitter',
        geocodeScore: null,
        displayName: cityCoord.displayName ?? null,
        sourceQuery: cityCoord.sourceQuery ?? null,
      };
      cache.schools[schoolKey] = resolved;
    }

    schools.push({
      id: makeSchoolId(row.schoolName, row.city),
      schoolName: row.schoolName,
      city: row.city,
      province: 'ON',
      rank: row.rank,
      rank5yr: row.rank5yr,
      trend: row.trend,
      rating: row.rating,
      rating5yr: row.rating5yr,
      source: row.source,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      coordinateSource: resolved.coordinateSource,
      geocodeScore: resolved.geocodeScore ?? null,
    });

    process.stdout.write(
      `Processed ${i + 1}/${rows.length}: ${row.schoolName} (${row.city}) [${resolved.coordinateSource}]\n`
    );
  }

  saveCache(cache);

  const sourceBreakdown = schools.reduce((acc, school) => {
    const key = school.coordinateSource;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    notes:
      'Coordinates are geocoded per school when available; unresolved schools fall back to city-level coordinates plus deterministic jitter.',
    count: schools.length,
    sourceBreakdown,
    schools,
  };
}

const payload = await buildDataset();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.count} Ontario schools to ${OUTPUT_JSON}`);
console.log(`Source breakdown: ${JSON.stringify(payload.sourceBreakdown)}`);
