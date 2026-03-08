import fs from 'node:fs';

const INPUT_CSV = 'data/csv/provincial/nb_schools.csv';
const OUTPUT_JSON = 'lib/data/nb-school-rankings.json';
const CACHE_JSON = 'lib/data/nb-school-geocodes.json';
const OSM_SCHOOL_CACHE_JSON = 'lib/data/nb-osm-schools.json';
const REQUEST_DELAY_MS = Number(process.env.NB_SCHOOL_GEOCODE_DELAY_MS ?? '900');

const CITY_ALIASES = {
  'St Andrews': 'Saint Andrews',
  'St George': 'Saint George',
  'Old Ridge': 'Saint Stephen',
  Miramichi: 'Miramichi',
  'Cambridge-Narrows': 'Cambridge Narrows',
};

const CITY_ANCHORS = {
  Fredericton: [45.9636, -66.6431],
  Moncton: [46.0878, -64.7782],
  Miramichi: [47.0299, -65.5019],
  'Saint John': [45.2733, -66.0633],
  Bathurst: [47.6186, -65.6519],
  Campbellton: [48.0075, -66.6727],
  Dalhousie: [48.0625, -66.3786],
  Edmundston: [47.3737, -68.3251],
  Oromocto: [45.8351, -66.4796],
  Woodstock: [46.152, -67.5922],
};

const SCHOOL_NAME_ALIASES = {
  'Upper Miramichi Regional High School': ['Upper Miramichi Elementary School'],
  'JMA Armstrong Salisbury Middle School': ['JMA Armstrong High School'],
  'James M Hill Memorial High School': ['James M. Hill High School'],
  'Carleton North Senior High School': ['Carleton North High School'],
  'Oromocto High School': ['Oromoncto High School'],
  'Doaktown Consolidated High School': ['Doaktown Elementary School'],
};

const SCHOOL_ADDRESS_OVERRIDES = {
  'Upper Miramichi Regional High School':
    '3466 Route 625, Boiestown, New Brunswick, E6A 1C8, Canada',
  'North & South Esk Regional High School':
    '40 Northwest Road, Sunny Corner, New Brunswick, E9E 1J4, Canada',
  'JMA Armstrong Salisbury Middle School':
    '55 Douglas Street, Salisbury, New Brunswick, E4J 2B4, Canada',
  "Saint Mary's Academy": '52 Marmen Avenue, Edmundston, New Brunswick, E3V 2H2, Canada',
  'James M Hill Memorial High School': '128 Henderson Street, Miramichi, New Brunswick, E1N 2S2, Canada',
  'Carleton North Senior High School':
    '30 School Street, Florenceville-Bristol, New Brunswick, E7L 2G2, Canada',
  'Oromocto High School': '25 MacKenzie Avenue, Oromocto, New Brunswick, E2V 1K4, Canada',
  'St Malachys Memorial High School': '20 Leinster Street, Saint John, New Brunswick, E2L 1H8, Canada',
  'Stanley Regional High School': '28 Bridge Street, Stanley, New Brunswick, E6B 1B2, Canada',
  'Doaktown Consolidated High School': '430 Main Street, Doaktown, New Brunswick, E9C 1E8, Canada',
};

const STOPWORDS = new Set([
  'school',
  'high',
  'middle',
  'elementary',
  'regional',
  'senior',
  'memorial',
  'academy',
  'and',
  'the',
  'de',
  'la',
  'le',
  'les',
  'saint',
  'st',
]);

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

function escapeCsvField(value) {
  const raw = String(value ?? '');
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function normalizeCity(city) {
  const normalized = String(city ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim();
  return CITY_ALIASES[normalized] ?? normalized;
}

function normalizeSchoolName(schoolName) {
  return String(schoolName ?? '')
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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
  return `nb-${hashString(`${schoolName}:${city}`).toString(36)}`;
}

function tokenizeName(value) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  return editDistance(a, b) <= 1;
}

function distanceKm(latA, lonA, latB, lonB) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(latB - latA);
  const dLon = toRad(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function readCsvRows() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const indexOf = (name) => headers.indexOf(name);

  const provinceIndex = indexOf('province');
  const schoolIndex = indexOf('school_name');
  const cityIndex = indexOf('city');
  const rankIndex = indexOf('rank_2019');
  const rank5yrIndex = indexOf('rank_5yr');
  const trendIndex = indexOf('trend');
  const ratingIndex = indexOf('overall_rating_2019');
  const rating5yrIndex = indexOf('overall_rating_5yr');
  const sourceIndex = indexOf('source');

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const schoolName = normalizeSchoolName(row[schoolIndex] ?? '');
    const city = normalizeCity(row[cityIndex] ?? '');
    if (!schoolName || !city) continue;

    rows.push({
      province: (row[provinceIndex] ?? 'NB').trim() || 'NB',
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

function loadOsmSchoolCache() {
  if (!fs.existsSync(OSM_SCHOOL_CACHE_JSON)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(OSM_SCHOOL_CACHE_JSON, 'utf8'));
    return Array.isArray(payload?.schools) ? payload.schools : null;
  } catch {
    return null;
  }
}

function saveOsmSchoolCache(schools) {
  const payload = {
    generatedAt: new Date().toISOString(),
    provider: 'OpenStreetMap Overpass',
    count: schools.length,
    schools,
  };
  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(OSM_SCHOOL_CACHE_JSON, `${JSON.stringify(payload, null, 2)}\n`);
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

function isInNewBrunswick(result) {
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

  return haystack.includes('new brunswick');
}

function scoreSchoolCandidate(result, schoolName, city) {
  const display = String(result?.display_name ?? '').toLowerCase();
  const schoolLower = schoolName.toLowerCase();
  const cityLower = city.toLowerCase();
  const kind = `${result?.class ?? ''}:${result?.type ?? ''}`.toLowerCase();

  let score = 0;
  if (isInNewBrunswick(result)) score += 5;
  if (display.includes(cityLower)) score += 3;
  if (display.includes(schoolLower)) score += 7;

  const words = schoolLower.split(/\s+/).filter((token) => token.length > 3);
  const matchedWords = words.filter((token) => display.includes(token)).length;
  score += Math.min(6, matchedWords);

  if (kind.includes('school')) score += 6;
  if (kind.includes('college')) score += 3;
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
        'user-agent': 'hackcanada-nb-school-geocoder/1.0 (hackathon project)',
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

async function fetchNbOsmSchools() {
  const cached = loadOsmSchoolCache();
  if (cached && cached.length > 0) return cached;

  const query =
    '[out:json][timeout:120];' +
    'area["ISO3166-2"="CA-NB"]->.searchArea;' +
    '(' +
    'node["amenity"="school"](area.searchArea);' +
    'way["amenity"="school"](area.searchArea);' +
    'relation["amenity"="school"](area.searchArea);' +
    ');' +
    'out center tags;';

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'user-agent': 'hackcanada-nb-school-geocoder/1.0 (hackathon project)',
      },
      body: query,
    });

    if (!response.ok) return [];
    const payload = await response.json();
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];
    const schools = elements
      .map((element) => {
        const latitude = Number(element?.lat ?? element?.center?.lat);
        const longitude = Number(element?.lon ?? element?.center?.lon);
        const name = String(element?.tags?.name ?? '').trim();
        const city = String(
          element?.tags?.['addr:city'] ?? element?.tags?.city ?? element?.tags?.['addr:town'] ?? ''
        ).trim();
        if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
          name,
          city: city || null,
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
        };
      })
      .filter(Boolean);

    saveOsmSchoolCache(schools);
    return schools;
  } catch {
    return [];
  }
}

function schoolAliases(schoolName) {
  return [schoolName, ...(SCHOOL_NAME_ALIASES[schoolName] ?? [])];
}

function scoreOsmSchoolCandidate(candidate, schoolName, city, cityCoord) {
  const candidateName = normalizeText(candidate.name);
  const candidateCity = normalizeText(candidate.city ?? '');
  const schoolNorm = normalizeText(schoolName);
  const cityNorm = normalizeText(city);
  const schoolTokenList = tokenizeName(schoolName);
  const candidateTokenList = tokenizeName(candidate.name);
  const aliases = schoolAliases(schoolName).map((value) => normalizeText(value));

  let score = 0;
  if (aliases.includes(candidateName)) score += 14;
  if (candidateName.includes(schoolNorm) || schoolNorm.includes(candidateName)) score += 5;

  let overlaps = 0;
  for (const token of schoolTokenList) {
    if (candidateTokenList.some((candidateToken) => tokensMatch(token, candidateToken))) {
      overlaps += 1;
    }
  }
  score += overlaps * 2.8;

  if (candidateCity && candidateCity.includes(cityNorm)) score += 2;
  if (candidateName.includes(cityNorm)) score += 1;

  const distance = cityCoord
    ? distanceKm(cityCoord.latitude, cityCoord.longitude, candidate.latitude, candidate.longitude)
    : Infinity;

  if (Number.isFinite(distance)) {
    if (distance <= 1.5) score += 3;
    else if (distance <= 5) score += 1.4;
    score -= Math.min(9, distance / 4);
  }

  return { score, distance };
}

function matchOsmSchool(schoolName, city, cityCoord, osmSchools) {
  if (!Array.isArray(osmSchools) || !osmSchools.length || !hasLatLon(cityCoord)) return null;

  const ranked = osmSchools
    .map((candidate) => {
      const { score, distance } = scoreOsmSchoolCandidate(candidate, schoolName, city, cityCoord);
      return { candidate, score, distance };
    })
    .filter((row) => Number.isFinite(row.distance) && row.distance <= 45)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  if (best.score < 6.8) return null;

  return {
    latitude: best.candidate.latitude,
    longitude: best.candidate.longitude,
    coordinateSource: 'osm-school-match',
    geocodeScore: Number(best.score.toFixed(2)),
    displayName: best.candidate.name,
    sourceQuery: `overpass: ${best.candidate.name}`,
  };
}

async function geocodeAddressOverride(schoolName, city) {
  const address = SCHOOL_ADDRESS_OVERRIDES[schoolName];
  if (!address) return null;

  const results = await nominatimSearch(address, 4);
  let best = null;
  let bestScore = -1;

  for (const result of results) {
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const display = normalizeText(result?.display_name);
    const kind = `${result?.class ?? ''}:${result?.type ?? ''}`.toLowerCase();
    let score = 0;
    if (isInNewBrunswick(result)) score += 5;
    if (display.includes(normalizeText(city))) score += 2;
    if (display.includes(normalizeText(schoolName))) score += 4;
    if (kind.includes('school')) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  if (!best || bestScore < 6) return null;
  return {
    latitude: Number(Number(best.lat).toFixed(6)),
    longitude: Number(Number(best.lon).toFixed(6)),
    coordinateSource: 'geocoded-address',
    geocodeScore: bestScore,
    displayName: best.display_name ?? null,
    sourceQuery: address,
  };
}

async function geocodeCity(city) {
  const queries = [
    `${city}, New Brunswick, Canada`,
    `${city}, NB, Canada`,
  ];

  for (const query of queries) {
    const results = await nominatimSearch(query, 3);
    const candidate = results.find((item) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && isInNewBrunswick(item);
    });

    if (candidate) {
      return {
        latitude: Number(Number(candidate.lat).toFixed(6)),
        longitude: Number(Number(candidate.lon).toFixed(6)),
        coordinateSource: 'geocoded-city',
        displayName: candidate.display_name ?? null,
        sourceQuery: query,
      };
    }

    await sleep(140);
  }

  if (CITY_ANCHORS[city]) {
    const [latitude, longitude] = CITY_ANCHORS[city];
    return {
      latitude,
      longitude,
      coordinateSource: 'city-anchor',
      displayName: null,
      sourceQuery: null,
    };
  }

  const lat = 45 + hashUnit(`nb-city-lat:${city}`) * 3.7;
  const lon = -68.9 + hashUnit(`nb-city-lon:${city}`) * 4.7;
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    coordinateSource: 'city-hash',
    displayName: null,
    sourceQuery: null,
  };
}

function localCityCoordinates(city) {
  if (CITY_ANCHORS[city]) {
    const [latitude, longitude] = CITY_ANCHORS[city];
    return {
      latitude,
      longitude,
      coordinateSource: 'city-anchor',
      displayName: null,
      sourceQuery: null,
    };
  }

  const lat = 45 + hashUnit(`nb-city-lat:${city}`) * 3.7;
  const lon = -68.9 + hashUnit(`nb-city-lon:${city}`) * 4.7;
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    coordinateSource: 'city-hash',
    displayName: null,
    sourceQuery: null,
  };
}

async function geocodeSchool(schoolName, city) {
  const queries = [
    `${schoolName}, ${city}, New Brunswick, Canada`,
    `${schoolName} School, ${city}, New Brunswick, Canada`,
    `${schoolName} High School, ${city}, New Brunswick, Canada`,
    `${schoolName}, ${city}, NB, Canada`,
    `${schoolName}, New Brunswick, Canada`,
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

function csvWithCoordinates(schools) {
  const header = [
    'province',
    'school_name',
    'city',
    'rank_2019',
    'rank_5yr',
    'trend',
    'overall_rating_2019',
    'overall_rating_5yr',
    'source',
    'latitude',
    'longitude',
    'coordinate_source',
    'geocode_score',
  ];

  const lines = [header.join(',')];
  for (const school of schools) {
    lines.push(
      [
        school.province,
        school.schoolName,
        school.city,
        school.rank ?? '',
        school.rank5yr ?? '',
        school.trend ?? '',
        school.rating ?? '',
        school.rating5yr ?? '',
        school.source ?? '',
        school.latitude,
        school.longitude,
        school.coordinateSource,
        school.geocodeScore ?? '',
      ]
        .map(escapeCsvField)
        .join(',')
    );
  }

  return `${lines.join('\n')}\n`;
}

async function buildDataset() {
  const rows = readCsvRows();
  const cache = loadCache();
  const osmSchools = await fetchNbOsmSchools();
  const schools = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const schoolKey = schoolCacheKey(row.schoolName, row.city);
    const cityKey = cityCacheKey(row.city);
    let resolved = cache.schools[schoolKey];
    let cityCoord = cache.cities[cityKey];

    if (!hasLatLon(resolved)) {
      if (!hasLatLon(cityCoord)) {
        cityCoord = localCityCoordinates(row.city);
        cache.cities[cityKey] = cityCoord;
      }

      resolved = matchOsmSchool(row.schoolName, row.city, cityCoord, osmSchools);
      if (resolved) {
        cache.schools[schoolKey] = resolved;
      }
    }

    if (!hasLatLon(resolved)) {
      resolved = await geocodeSchool(row.schoolName, row.city);
      if (resolved) {
        cache.schools[schoolKey] = resolved;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    if (!hasLatLon(resolved)) {
      resolved = await geocodeAddressOverride(row.schoolName, row.city);
      if (resolved) {
        cache.schools[schoolKey] = resolved;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    if (!hasLatLon(resolved)) {
      if (!hasLatLon(cityCoord) || cityCoord.coordinateSource === 'city-hash') {
        cityCoord = await geocodeCity(row.city);
        cache.cities[cityKey] = cityCoord;
        await sleep(REQUEST_DELAY_MS);
      }
      resolved = {
        latitude: cityCoord.latitude,
        longitude: cityCoord.longitude,
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
      province: 'NB',
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
  const preciseSources = new Set(['geocoded-school', 'osm-school-match', 'geocoded-address']);
  const preciseSchoolCount = schools.filter((school) => preciseSources.has(school.coordinateSource)).length;
  const fallbackCount = schools.length - preciseSchoolCount;
  const sourceBreakdown = schools.reduce((acc, school) => {
    const key = school.coordinateSource;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap Nominatim',
    notes:
      'Coordinates are resolved via school geocoding, OSM school feature matching, and address-level geocoding. Remaining unresolved schools use geocoded city centroids.',
    count: schools.length,
    preciseSchoolCount,
    fallbackCount,
    sourceBreakdown,
    schools,
  };
}

const payload = await buildDataset();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(INPUT_CSV, csvWithCoordinates(payload.schools));
console.log(`Wrote ${payload.count} NB schools to ${OUTPUT_JSON}`);
console.log(`Updated ${INPUT_CSV} with latitude/longitude columns`);
console.log(`Precise school points: ${payload.preciseSchoolCount}, fallback schools: ${payload.fallbackCount}`);
console.log(`Source breakdown: ${JSON.stringify(payload.sourceBreakdown)}`);
