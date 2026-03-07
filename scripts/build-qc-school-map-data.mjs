import fs from 'node:fs';

const INPUT_CSV = 'quebec_469_schools (1).csv';
const OUTPUT_JSON = 'lib/data/qc-school-rankings.json';
const CACHE_JSON = 'lib/data/qc-school-geocodes.json';
const OSM_CACHE_JSON = 'lib/data/qc-osm-schools.json';
const OSM_PLACE_CACHE_JSON = 'lib/data/qc-osm-places.json';

const CITY_ALIASES = {
  Montreal: 'Montreal',
  'Montréal': 'Montreal',
  Quebec: 'Quebec City',
  'Québec': 'Quebec City',
  Levis: 'Levis',
  'Lévis': 'Levis',
  'St-Jean-sur-Richelieu': 'Saint-Jean-sur-Richelieu',
  'St-Jerome': 'Saint-Jerome',
  'St-Jérôme': 'Saint-Jerome',
};

const CITY_ANCHORS = {
  Montreal: [45.5019, -73.5674],
  'Quebec City': [46.8139, -71.208],
  Laval: [45.6066, -73.7124],
  Gatineau: [45.4765, -75.7013],
  Longueuil: [45.5312, -73.5181],
  Sherbrooke: [45.4042, -71.8929],
  'Trois-Rivieres': [46.343, -72.5439],
  Saguenay: [48.4165, -71.0522],
  Clarendon: [45.675, -76.483],
};

const QUEBEC_FALLBACK_CENTER = {
  latitude: 46.8139,
  longitude: -71.208,
};

const PLACE_TYPE_WEIGHT = {
  city: 9,
  town: 8,
  municipality: 7,
  borough: 6,
  village: 6,
  suburb: 4,
  hamlet: 3,
  locality: 2,
};

const STOPWORDS = new Set([
  'ecole',
  'school',
  'secondaire',
  'high',
  'college',
  'collegial',
  'institut',
  'academy',
  'academie',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'd',
  'l',
]);

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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function nameTokens(name) {
  return normalizeText(name)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
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
  return `qc-${hashString(`${schoolName}:${city}`).toString(36)}`;
}

function schoolCacheKey(schoolName, city) {
  return `${normalizeText(normalizeSchoolName(schoolName))}|${normalizeText(normalizeCity(city))}`;
}

function cityCacheKey(city) {
  return normalizeText(normalizeCity(city));
}

function getJitteredCoordinates(baseLat, baseLon, schoolName) {
  const latOffset = (hashUnit(`qc-school-lat:${schoolName}`) - 0.5) * 0.08;
  const lonOffset = (hashUnit(`qc-school-lon:${schoolName}`) - 0.5) * 0.11;
  return {
    latitude: Number((baseLat + latOffset).toFixed(6)),
    longitude: Number((baseLon + lonOffset).toFixed(6)),
  };
}

function cityNameVariants(city) {
  const base = normalizeCity(city);
  const variants = new Set([base]);
  variants.add(base.replace(/^St[-.\s]/i, 'Saint-'));
  variants.add(base.replace(/^Saint[-\s]/i, 'St-'));
  variants.add(base.replace(/\bSainte[-\s]/i, 'Ste-'));
  variants.add(base.replace(/\bSte[-.\s]/i, 'Sainte-'));
  return [...variants];
}

function placeRank(place) {
  const placeType = normalizeText(place.placeType || '');
  const typeWeight = PLACE_TYPE_WEIGHT[placeType] ?? 1;
  return typeWeight * 10_000_000 + Math.max(0, place.population ?? 0);
}

function chooseBetterPlace(a, b) {
  return placeRank(a) >= placeRank(b) ? a : b;
}

function placeNamesFromTags(tags) {
  const fields = ['name', 'name:fr', 'name:en', 'official_name', 'short_name', 'alt_name'];
  const names = new Set();
  for (const field of fields) {
    const raw = String(tags[field] ?? '').trim();
    if (!raw) continue;
    raw
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((name) => names.add(name));
  }
  return [...names];
}

function parsePopulation(raw) {
  if (raw == null) return null;
  const numeric = Number(String(raw).replace(/[^0-9]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildCityCentroidPlacesFromDataset(datasetPath) {
  if (!fs.existsSync(datasetPath)) return [];
  const payload = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const schools = Array.isArray(payload?.schools) ? payload.schools : [];
  const bucket = new Map();

  for (const school of schools) {
    if (school.coordinateSource !== 'osm-school-match') continue;
    const city = normalizeCity(school.city ?? '');
    const key = normalizeText(city);
    const lat = Number(school.latitude);
    const lon = Number(school.longitude);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    if (!bucket.has(key)) {
      bucket.set(key, {
        city,
        sumLat: 0,
        sumLon: 0,
        count: 0,
      });
    }
    const item = bucket.get(key);
    item.sumLat += lat;
    item.sumLon += lon;
    item.count += 1;
  }

  const places = [];
  for (const [key, item] of bucket.entries()) {
    places.push({
      id: `dataset-centroid-${key}`,
      placeType: 'municipality',
      population: null,
      names: [item.city],
      latitude: Number((item.sumLat / item.count).toFixed(6)),
      longitude: Number((item.sumLon / item.count).toFixed(6)),
    });
  }
  return places;
}

function buildCityCentroidPlacesFromOsmSchools(schools) {
  const bucket = new Map();
  for (const school of schools) {
    const city = normalizeCity(school.city ?? '');
    const key = normalizeText(city);
    const lat = Number(school.latitude);
    const lon = Number(school.longitude);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    if (!bucket.has(key)) {
      bucket.set(key, {
        city,
        sumLat: 0,
        sumLon: 0,
        count: 0,
      });
    }
    const item = bucket.get(key);
    item.sumLat += lat;
    item.sumLon += lon;
    item.count += 1;
  }

  const places = [];
  for (const [key, item] of bucket.entries()) {
    places.push({
      id: `osm-school-city-${key}`,
      placeType: 'municipality',
      population: null,
      names: [item.city],
      latitude: Number((item.sumLat / item.count).toFixed(6)),
      longitude: Number((item.sumLon / item.count).toFixed(6)),
    });
  }
  return places;
}

function buildPlaceLookup(places) {
  const byNormalizedName = new Map();
  for (const place of places) {
    for (const name of place.names) {
      const normalized = normalizeText(name);
      if (!normalized) continue;
      const existing = byNormalizedName.get(normalized);
      if (!existing) {
        byNormalizedName.set(normalized, place);
        continue;
      }
      byNormalizedName.set(normalized, chooseBetterPlace(place, existing));
    }
  }
  return byNormalizedName;
}

function bestFuzzyPlace(city, places) {
  const cityNorm = normalizeText(city);
  const cityTokens = nameTokens(city);
  if (!cityNorm || !cityTokens.length) return null;

  let best = null;
  let bestScore = -1;
  for (const place of places) {
    let score = 0;

    for (const name of place.names) {
      const nameNorm = normalizeText(name);
      if (!nameNorm) continue;
      if (nameNorm === cityNorm) score += 120;
      else if (nameNorm.includes(cityNorm) || cityNorm.includes(nameNorm)) score += 32;

      const overlap = overlapCount(cityTokens, nameTokens(name));
      score += overlap * 18;
      if (overlap > 0) score += (overlap / cityTokens.length) * 24;
    }

    score += (PLACE_TYPE_WEIGHT[normalizeText(place.placeType || '')] ?? 1) * 0.8;

    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }

  if (!best || bestScore < 28) return null;
  return best;
}

function resolveCityCoordinates(city, placeLookup, places) {
  for (const variant of cityNameVariants(city)) {
    const key = normalizeText(variant);
    const place = placeLookup.get(key);
    if (place) {
      return {
        latitude: place.latitude,
        longitude: place.longitude,
        coordinateSource: 'city-place+jitter',
      };
    }
  }

  const fuzzy = bestFuzzyPlace(city, places);
  if (fuzzy) {
    return {
      latitude: fuzzy.latitude,
      longitude: fuzzy.longitude,
      coordinateSource: 'city-fuzzy+jitter',
    };
  }

  if (CITY_ANCHORS[city]) {
    const [latitude, longitude] = CITY_ANCHORS[city];
    return { latitude, longitude, coordinateSource: 'city-anchor+jitter' };
  }

  return {
    latitude: QUEBEC_FALLBACK_CENTER.latitude,
    longitude: QUEBEC_FALLBACK_CENTER.longitude,
    coordinateSource: 'qc-centroid+jitter',
  };
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

async function fetchOsmSchools() {
  const query = `
[out:json][timeout:240];
area["name"="Québec"]["admin_level"="4"]->.qc;
(
  node["amenity"="school"]["name"](area.qc);
  way["amenity"="school"]["name"](area.qc);
  relation["amenity"="school"]["name"](area.qc);
);
out center tags;
`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements
    .map((element) => {
      const lat = Number(element?.lat ?? element?.center?.lat);
      const lon = Number(element?.lon ?? element?.center?.lon);
      const tags = element?.tags ?? {};
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const name = String(tags.name ?? '').trim();
      if (!name) return null;
      const city =
        tags['addr:city'] ??
        tags['addr:municipality'] ??
        tags['is_in:city'] ??
        '';
      return {
        id: `${element?.type ?? 'x'}-${element?.id ?? Math.random().toString(36).slice(2)}`,
        name,
        city: normalizeCity(city),
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        tokens: nameTokens(name),
        normalizedName: normalizeText(name),
      };
    })
    .filter(Boolean);
}

async function fetchOsmPlaces() {
  const query = `
[out:json][timeout:240];
area["name"="Québec"]["admin_level"="4"]->.qc;
(
  node["place"~"^(city|town|village|municipality|borough|suburb|hamlet|locality)$"]["name"](area.qc);
  way["place"~"^(city|town|village|municipality|borough|suburb|hamlet|locality)$"]["name"](area.qc);
  relation["place"~"^(city|town|village|municipality|borough|suburb|hamlet|locality)$"]["name"](area.qc);
);
out center tags;
`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Overpass place request failed (${response.status})`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements
    .map((element) => {
      const lat = Number(element?.lat ?? element?.center?.lat);
      const lon = Number(element?.lon ?? element?.center?.lon);
      const tags = element?.tags ?? {};
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const names = placeNamesFromTags(tags);
      if (!names.length) return null;

      return {
        id: `${element?.type ?? 'x'}-${element?.id ?? Math.random().toString(36).slice(2)}`,
        placeType: String(tags.place ?? ''),
        population: parsePopulation(tags.population),
        names,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
      };
    })
    .filter(Boolean);
}

function loadOsmSchools() {
  if (fs.existsSync(OSM_CACHE_JSON)) {
    const payload = JSON.parse(fs.readFileSync(OSM_CACHE_JSON, 'utf8'));
    if (Array.isArray(payload?.schools) && payload.schools.length > 0) {
      return payload.schools;
    }
  }
  return null;
}

function loadOsmPlaces() {
  if (fs.existsSync(OSM_PLACE_CACHE_JSON)) {
    const payload = JSON.parse(fs.readFileSync(OSM_PLACE_CACHE_JSON, 'utf8'));
    if (Array.isArray(payload?.places) && payload.places.length > 0) {
      return payload.places;
    }
  }
  return null;
}

function saveOsmSchools(schools) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap Overpass API',
    count: schools.length,
    schools,
  };
  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(OSM_CACHE_JSON, `${JSON.stringify(payload, null, 2)}\n`);
}

function saveOsmPlaces(places) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap Overpass API',
    count: places.length,
    places,
  };
  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(OSM_PLACE_CACHE_JSON, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildTokenIndex(schools) {
  const index = new Map();
  for (let i = 0; i < schools.length; i += 1) {
    const school = schools[i];
    const uniqueTokens = new Set(school.tokens);
    for (const token of uniqueTokens) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(i);
    }
  }
  return index;
}

function overlapCount(aTokens, bTokens) {
  const set = new Set(bTokens);
  let count = 0;
  for (const token of aTokens) {
    if (set.has(token)) count += 1;
  }
  return count;
}

function matchSchool(row, schools, tokenIndex) {
  const schoolNameNorm = normalizeText(row.schoolName);
  const schoolTokens = nameTokens(row.schoolName);
  const cityNorm = normalizeText(row.city);

  if (!schoolTokens.length) return null;

  const candidateIndexes = new Set();
  for (const token of schoolTokens.slice(0, 5)) {
    const idxList = tokenIndex.get(token) ?? [];
    for (const idx of idxList) candidateIndexes.add(idx);
  }

  if (!candidateIndexes.size) return null;

  let best = null;
  let bestScore = -1;
  let bestCityMatch = false;
  let bestHasCity = false;
  for (const idx of candidateIndexes) {
    const candidate = schools[idx];
    let score = 0;

    if (candidate.normalizedName === schoolNameNorm) score += 120;
    if (candidate.normalizedName.includes(schoolNameNorm) || schoolNameNorm.includes(candidate.normalizedName)) {
      score += 30;
    }

    const common = overlapCount(schoolTokens, candidate.tokens);
    score += common * 18;
    score += (common / Math.max(1, schoolTokens.length)) * 28;

    let cityMatched = false;
    let hasCity = false;
    if (candidate.city) {
      hasCity = true;
      const candidateCityNorm = normalizeText(candidate.city);
      if (candidateCityNorm === cityNorm) {
        score += 30;
        cityMatched = true;
      } else if (candidateCityNorm.includes(cityNorm) || cityNorm.includes(candidateCityNorm)) {
        score += 16;
        cityMatched = true;
      } else {
        score -= 22;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
      bestCityMatch = cityMatched;
      bestHasCity = hasCity;
    }
  }

  if (!best || bestScore < 52) return null;
  if (bestHasCity && !bestCityMatch && bestScore < 90) return null;
  return {
    latitude: best.latitude,
    longitude: best.longitude,
    coordinateSource: 'osm-school-match',
    matchScore: Number(bestScore.toFixed(2)),
    matchedName: best.name,
    matchedCity: best.city || null,
  };
}

function loadCache() {
  if (!fs.existsSync(CACHE_JSON)) {
    return { schools: {}, cities: {} };
  }
  const payload = JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'));
  return {
    schools: payload?.schools ?? {},
    cities: payload?.cities ?? {},
  };
}

function saveCache(cache) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap Overpass school POIs + deterministic city fallback',
    schools: cache.schools,
    cities: cache.cities,
  };
  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(CACHE_JSON, `${JSON.stringify(payload, null, 2)}\n`);
}

async function buildDataset() {
  const rows = readCsvRows();
  const cache = loadCache();
  const datasetCentroidPlaces = buildCityCentroidPlacesFromDataset(OUTPUT_JSON);

  let osmSchools = loadOsmSchools();
  if (!osmSchools) {
    osmSchools = await fetchOsmSchools();
    saveOsmSchools(osmSchools);
  }
  const schoolCityCentroidPlaces = buildCityCentroidPlacesFromOsmSchools(osmSchools);

  let osmPlaces = loadOsmPlaces();
  if (!osmPlaces) {
    try {
      osmPlaces = await fetchOsmPlaces();
      saveOsmPlaces(osmPlaces);
    } catch (error) {
      console.warn(`OSM place lookup unavailable, using inferred city centroids: ${error?.message ?? error}`);
      osmPlaces = [];
    }
  }

  const tokenIndex = buildTokenIndex(osmSchools);
  const allPlaces = [...osmPlaces, ...datasetCentroidPlaces, ...schoolCityCentroidPlaces];
  const placeLookup = buildPlaceLookup(allPlaces);
  const schools = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const schoolKey = schoolCacheKey(row.schoolName, row.city);
    const cityKey = cityCacheKey(row.city);

    const matched = matchSchool(row, osmSchools, tokenIndex);
    let resolved;
    if (matched) {
      resolved = matched;
    } else {
      let cityCoord = cache.cities[cityKey];
      if (
        !cityCoord ||
        !Number.isFinite(cityCoord.latitude) ||
        !Number.isFinite(cityCoord.longitude) ||
        cityCoord.coordinateSource === 'city-hash+jitter' ||
        cityCoord.coordinateSource === 'osm-city-place+jitter' ||
        cityCoord.coordinateSource === 'osm-city-fuzzy+jitter' ||
        cityCoord.coordinateSource === 'qc-centroid+jitter'
      ) {
        cityCoord = resolveCityCoordinates(row.city, placeLookup, allPlaces);
        cache.cities[cityKey] = cityCoord;
      }
      const jittered = getJitteredCoordinates(cityCoord.latitude, cityCoord.longitude, `${row.schoolName}:${row.city}`);
      resolved = {
        latitude: jittered.latitude,
        longitude: jittered.longitude,
        coordinateSource: cityCoord.coordinateSource,
        matchScore: null,
        matchedName: null,
        matchedCity: null,
      };
    }

    cache.schools[schoolKey] = resolved;
    schools.push({
      id: makeSchoolId(row.schoolName, row.city),
      schoolName: row.schoolName,
      city: row.city,
      province: 'QC',
      rank: row.rank,
      rating: row.rating,
      rating5yr: row.rating5yr,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      coordinateSource: resolved.coordinateSource,
      matchScore: resolved.matchScore ?? null,
      matchedName: resolved.matchedName ?? null,
      matchedCity: resolved.matchedCity ?? null,
    });

    process.stdout.write(
      `Processed ${i + 1}/${rows.length}: ${row.schoolName} (${row.city}) [${resolved.coordinateSource}]\n`
    );
  }

  saveCache(cache);

  const osmMatchedCount = schools.filter((school) => school.coordinateSource === 'osm-school-match').length;
  const cityPlaceCount = schools.filter((school) =>
    ['city-place+jitter', 'osm-city-place+jitter'].includes(school.coordinateSource)
  ).length;
  const cityFuzzyCount = schools.filter((school) =>
    ['city-fuzzy+jitter', 'osm-city-fuzzy+jitter'].includes(school.coordinateSource)
  ).length;
  const cityAnchorCount = schools.filter((school) => school.coordinateSource === 'city-anchor+jitter').length;
  const qcCentroidCount = schools.filter((school) => school.coordinateSource === 'qc-centroid+jitter').length;

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap school POIs + inferred Quebec city centroid fallback',
    notes:
      'School coordinates are matched against OSM school POIs in Quebec by school name and city. Unmatched schools fall back to Quebec city centroid coordinates + deterministic jitter.',
    count: schools.length,
    osmMatchedCount,
    cityPlaceCount,
    cityFuzzyCount,
    cityAnchorCount,
    qcCentroidCount,
    schools,
  };
}

const payload = await buildDataset();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.count} Quebec schools to ${OUTPUT_JSON}`);
console.log(
  `osm-school-match: ${payload.osmMatchedCount}, city-place+jitter: ${payload.cityPlaceCount}, city-fuzzy+jitter: ${payload.cityFuzzyCount}, city-anchor+jitter: ${payload.cityAnchorCount}, qc-centroid+jitter: ${payload.qcCentroidCount}`
);
