import fs from 'node:fs';

const RANKINGS_JSON = 'lib/data/on-school-rankings.json';
const GEO_CACHE_JSON = 'lib/data/on-school-geocodes.json';
const REQUEST_DELAY_MS = Number(process.env.ON_DERIVED_CITY_DELAY_MS ?? '150');
const REQUEST_TIMEOUT_MS = Number(process.env.ON_DERIVED_CITY_TIMEOUT_MS ?? '7000');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}
function hashUnit(input) { return hashString(input) / 4294967295; }

async function geocodeCity(city) {
  const query = `${city}, Ontario, Canada`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(url, {
      headers: { 'user-agent': 'hackcanada-on-derived-city-fix/1.0 (hackathon project)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    if (features.length === 0) return null;

    const best = features.find((feature) => {
      const props = feature?.properties ?? {};
      const state = String(props?.state ?? '').toLowerCase();
      const country = String(props?.country ?? '').toLowerCase();
      return state.includes('ontario') && country.includes('canada');
    }) ?? features[0];

    const coords = Array.isArray(best?.geometry?.coordinates) ? best.geometry.coordinates : [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const props = best?.properties ?? {};
    const displayName = [props?.name, props?.city, props?.county, props?.state, props?.country]
      .filter(Boolean)
      .join(', ');

    return {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      coordinateSource: 'geocoded-city+jitter',
      displayName: displayName || null,
    };
  } catch {
    return null;
  }
}

const rankings = JSON.parse(fs.readFileSync(RANKINGS_JSON, 'utf8'));
const geoCache = JSON.parse(fs.readFileSync(GEO_CACHE_JSON, 'utf8'));
const cityRows = Array.isArray(geoCache.cities) ? geoCache.cities : [];
const cityMap = new Map(cityRows.map((row) => [row.city, row]));

const derivedSchools = rankings.schools.filter((s) => s.coordinateSource === 'city-derived-anchor+jitter');
const targetCities = [...new Set(derivedSchools.map((s) => s.city))];

let geocodedCities = 0;
for (let i = 0; i < targetCities.length; i += 1) {
  const city = targetCities[i];
  const existing = cityMap.get(city);

  const needsFix = !existing || existing.coordinateSource === 'city-derived-anchor+jitter';
  if (!needsFix) continue;

  const resolved = await geocodeCity(city);
  if (resolved) {
    cityMap.set(city, {
      city,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      coordinateSource: resolved.coordinateSource,
      derivedFrom: null,
      displayName: resolved.displayName,
    });
    geocodedCities += 1;
  }

  if ((i + 1) % 20 === 0) {
    console.log(`Geocoded cities ${i + 1}/${targetCities.length} (updated ${geocodedCities})`);
  }
  await sleep(REQUEST_DELAY_MS);
}

let moved = 0;
for (const school of rankings.schools) {
  if (school.coordinateSource !== 'city-derived-anchor+jitter') continue;
  const city = cityMap.get(school.city);
  if (!city || !Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) continue;

  const latOff = (hashUnit(`on-city-tight-lat:${school.id}`) - 0.5) * 0.022;
  const lonOff = (hashUnit(`on-city-tight-lon:${school.id}`) - 0.5) * 0.028;
  school.latitude = Number((city.latitude + latOff).toFixed(6));
  school.longitude = Number((city.longitude + lonOff).toFixed(6));
  school.coordinateSource = 'city-derived-anchor+tight-jitter';
  moved += 1;
}

geoCache.generatedAt = new Date().toISOString();
geoCache.provider = 'OpenStreetMap Nominatim + legacy cache';
geoCache.cities = [...cityMap.values()];

rankings.generatedAt = new Date().toISOString();
rankings.notes = `${rankings.notes} Derived Ontario city anchors corrected via city geocoding.`;
rankings.sourceBreakdown = rankings.schools.reduce((acc, row) => {
  const key = row.coordinateSource || 'unknown';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

fs.writeFileSync(GEO_CACHE_JSON, `${JSON.stringify(geoCache, null, 2)}\n`);
fs.writeFileSync(RANKINGS_JSON, `${JSON.stringify(rankings, null, 2)}\n`);

console.log(`Target cities: ${targetCities.length}`);
console.log(`Cities geocoded: ${geocodedCities}`);
console.log(`Schools moved: ${moved}`);
console.log(`Source breakdown: ${JSON.stringify(rankings.sourceBreakdown)}`);
