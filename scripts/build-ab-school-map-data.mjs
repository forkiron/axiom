import fs from 'node:fs';

const INPUT_CSV = 'data/csv/provincial/ab_school_rankings.csv';
const OUTPUT_JSON = 'lib/data/ab-school-rankings.json';
const CACHE_JSON = 'lib/data/ab-school-geocodes.json';
const REQUEST_DELAY_MS = Number(process.env.AB_SCHOOL_GEOCODE_DELAY_MS ?? '1100');

const CITY_ALIASES = {
  Foothills: 'Foothills County',
  Morinville: 'Morinville',
  'Fort McMurray': 'Fort McMurray',
  'St. Albert': 'St Albert',
  'St Albert': 'St Albert',
};

const CITY_ANCHORS = {
  Calgary: [51.0447, -114.0719],
  Edmonton: [53.5461, -113.4938],
  Lethbridge: [49.6956, -112.8451],
  'Fort McMurray': [56.7264, -111.3803],
  'Red Deer': [52.2681, -113.8112],
  Airdrie: [51.2927, -114.0144],
  'Medicine Hat': [50.0405, -110.6777],
  'Grande Prairie': [55.1707, -118.7987],
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
  const normalized = city
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
  return CITY_ALIASES[normalized] ?? normalized;
}

function normalizeSchoolName(schoolName) {
  return schoolName
    .replace(/\s+/g, ' ')
    .replace(/\s+\((?:[^)]+)\)\s*$/g, '')
    .trim();
}

function parseOptionalNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'n/a') return null;
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
  return `ab-${hashString(`${schoolName}:${city}`).toString(36)}`;
}

function readCsvRows() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name) => headers.indexOf(name);

  const schoolIndex = indexOf('school_name');
  const cityIndex = indexOf('city');
  const rankIndex = indexOf('rank_2024');
  const ratingIndex = indexOf('overall_rating_2024');
  const rating5yrIndex = indexOf('overall_rating_5yr');

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
      rating: parseOptionalNumber(row[ratingIndex]),
      rating5yr: parseOptionalNumber(row[rating5yrIndex]),
    });
  }

  return rows;
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

function isInAlberta(result) {
  const haystack = [
    result?.display_name,
    result?.address?.state,
    result?.address?.province,
    result?.address?.county,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes('alberta');
}

function scoreSchoolCandidate(result, schoolName, city) {
  const display = String(result?.display_name ?? '').toLowerCase();
  const schoolLower = schoolName.toLowerCase();
  const cityLower = city.toLowerCase();
  const kind = `${result?.class ?? ''}:${result?.type ?? ''}`.toLowerCase();

  let score = 0;
  if (isInAlberta(result)) score += 4;
  if (display.includes(cityLower)) score += 2;
  if (display.includes(schoolLower)) score += 6;

  const words = schoolLower.split(/\s+/).filter((token) => token.length > 3);
  const matchedWords = words.filter((token) => display.includes(token)).length;
  score += Math.min(4, matchedWords);

  if (kind.includes('school')) score += 5;
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
        'user-agent': 'hackcanada-ab-school-geocoder/1.0 (hackathon project)',
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
  const queries = [
    `${city}, Alberta, Canada`,
    `${city}, AB, Canada`,
  ];

  for (const query of queries) {
    const results = await nominatimSearch(query, 2);
    const candidate = results.find((item) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && isInAlberta(item);
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

    await sleep(150);
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

  const lat = 49 + hashUnit(`ab-city-lat:${city}`) * 11.5;
  const lon = -120 + hashUnit(`ab-city-lon:${city}`) * 10.8;
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    coordinateSource: 'city-hash+jitter',
    displayName: null,
    sourceQuery: null,
  };
}

function getJitteredCoordinates(baseLat, baseLon, schoolName) {
  const latOffset = (hashUnit(`ab-school-lat:${schoolName}`) - 0.5) * 0.1;
  const lonOffset = (hashUnit(`ab-school-lon:${schoolName}`) - 0.5) * 0.14;
  return {
    latitude: Number((baseLat + latOffset).toFixed(6)),
    longitude: Number((baseLon + lonOffset).toFixed(6)),
  };
}

async function geocodeSchool(schoolName, city) {
  const queries = [
    `${schoolName}, ${city}, Alberta, Canada`,
    `${schoolName} School, ${city}, Alberta, Canada`,
    `${schoolName} High School, ${city}, Alberta, Canada`,
    `${schoolName}, Alberta, Canada`,
  ];

  let bestCandidate = null;
  let bestScore = -1;
  let bestQuery = null;

  for (const query of queries) {
    const results = await nominatimSearch(query, 5);
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

    if (bestScore >= 9 && bestCandidate) {
      return {
        latitude: Number(Number(bestCandidate.lat).toFixed(6)),
        longitude: Number(Number(bestCandidate.lon).toFixed(6)),
        coordinateSource: 'geocoded-school',
        geocodeScore: bestScore,
        displayName: bestCandidate.display_name ?? null,
        sourceQuery: bestQuery,
      };
    }

    await sleep(180);
  }

  if (bestCandidate && bestScore >= 7) {
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
        cityCoord = await geocodeCity(row.city);
        cache.cities[cityKey] = cityCoord;
        await sleep(REQUEST_DELAY_MS);
      }

      const jittered = getJitteredCoordinates(cityCoord.latitude, cityCoord.longitude, `${row.schoolName}:${row.city}`);
      resolved = {
        latitude: jittered.latitude,
        longitude: jittered.longitude,
        coordinateSource: cityCoord.coordinateSource,
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
      province: 'AB',
      rank: row.rank,
      rating: row.rating,
      rating5yr: row.rating5yr,
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
  const geocodedSchoolCount = schools.filter((school) => school.coordinateSource === 'geocoded-school').length;
  const fallbackCount = schools.length - geocodedSchoolCount;

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap Nominatim',
    notes:
      'Coordinates are geocoded per school when available; unresolved schools fall back to city centroid plus deterministic jitter.',
    count: schools.length,
    geocodedSchoolCount,
    fallbackCount,
    schools,
  };
}

const payload = await buildDataset();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.count} Alberta schools to ${OUTPUT_JSON}`);
console.log(
  `Geocoded schools: ${payload.geocodedSchoolCount}, fallback schools: ${payload.fallbackCount}`
);
