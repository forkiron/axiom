import fs from 'node:fs';

const INPUT_CSV = 'bc_school_rankings_2025.csv';
const OUTPUT_JSON = 'lib/data/bc-school-rankings.json';
const CITY_CENTROIDS_PATH = 'lib/data/bc-city-centroids.json';

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

  const aliases = {
    'Fort St John': 'Fort St John',
    'Fort St James': 'Fort St James',
    Mcbride: 'McBride',
  };

  return aliases[normalized] ?? normalized;
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

function loadCityCentroids() {
  if (!fs.existsSync(CITY_CENTROIDS_PATH)) return new Map();
  const payload = JSON.parse(fs.readFileSync(CITY_CENTROIDS_PATH, 'utf8'));
  const rows = payload?.cities ?? [];
  return new Map(rows.map((row) => [normalizeCity(row.city), [row.latitude, row.longitude]]));
}

function getCityAnchor(city, centroidMap) {
  const centroid = centroidMap.get(city);
  if (centroid) return centroid;
  if (CITY_ANCHORS[city]) return CITY_ANCHORS[city];
  const uLat = hashUnit(`lat:${city}`);
  const uLon = hashUnit(`lon:${city}`);
  const lat = 48.1 + uLat * 11.7;
  const lon = -138.9 + uLon * 24.6;
  return [lat, lon];
}

function getSchoolCoordinates(city, schoolName, centroidMap) {
  const [cityLat, cityLon] = getCityAnchor(city, centroidMap);
  const u1 = hashUnit(`school-lat:${city}:${schoolName}`) - 0.5;
  const u2 = hashUnit(`school-lon:${city}:${schoolName}`) - 0.5;
  const lat = cityLat + u1 * 0.12;
  const lon = cityLon + u2 * 0.16;
  return [Number(lat.toFixed(6)), Number(lon.toFixed(6))];
}

function parseOptionalNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'n/a') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildBcSchoolMapData() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const centroidMap = loadCityCentroids();

  const col = (name) => headers.indexOf(name);

  const schools = [];
  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const schoolName = row[col('school_name')]?.trim();
    const cityRaw = row[col('city')]?.trim();
    if (!schoolName || !cityRaw) continue;

    const city = normalizeCity(cityRaw);
    const rating = parseOptionalNumber(row[col('overall_rating_2023_2024')]);
    const rating5yr = parseOptionalNumber(row[col('overall_rating_5yr')]);
    const rank = parseOptionalNumber(row[col('rank_2023_2024')]);
    const [latitude, longitude] = getSchoolCoordinates(city, schoolName, centroidMap);
    const hasRealCityCentroid = centroidMap.has(city);

    schools.push({
      id: `bc-${hashString(`${schoolName}:${city}`).toString(36)}`,
      schoolName,
      city,
      province: 'BC',
      rank,
      rating,
      rating5yr,
      latitude,
      longitude,
      coordinateSource: hasRealCityCentroid
        ? 'geocoded-city+jitter'
        : CITY_ANCHORS[city]
          ? 'city-anchor+jitter'
          : 'city-hash+jitter',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    notes:
      'Coordinates are approximated from city-level anchors and deterministic jitter per school because the source CSV has no exact school coordinates.',
    count: schools.length,
    schools,
  };
}

const payload = buildBcSchoolMapData();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.count} BC schools to ${OUTPUT_JSON}`);
