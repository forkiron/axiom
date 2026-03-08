import fs from 'node:fs';

const INPUT_CSV = 'data/csv/provincial/bc_252_schools_2019.csv';
const OUTPUT_JSON = 'lib/data/bc-city-centroids.json';
const REQUEST_DELAY_MS = Number(process.env.BC_CITY_GEOCODE_DELAY_MS ?? '1100');

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

  const aliases = {
    'Fort St John': 'Fort St John',
    'Fort St James': 'Fort St James',
    Mcbride: 'McBride',
  };

  return aliases[normalized] ?? normalized;
}

async function geocodeCity(city) {
  const queries = [
    `${city}, British Columbia, Canada`,
    `${city}, BC, Canada`,
    `${city}, Canada`,
  ];

  for (const query of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'hackcanada-bc-geocoder/1.0 (hackathon project)',
        'accept-language': 'en',
      },
    });
    if (!response.ok) {
      if (response.status === 429) {
        await sleep(2200);
        continue;
      }
      continue;
    }
    const payload = await response.json();
    const top = Array.isArray(payload) ? payload[0] : null;
    if (top && Number.isFinite(Number(top.lat)) && Number.isFinite(Number(top.lon))) {
      return {
        latitude: Number(top.lat),
        longitude: Number(top.lon),
        displayName: top.display_name ?? null,
        sourceQuery: query,
      };
    }
    await sleep(250);
  }

  return null;
}

function readCitiesFromCsv() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const cityCol = headers.indexOf('city');
  const cities = new Set();

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const city = normalizeCity(row[cityCol] ?? '');
    if (city) cities.add(city);
  }

  return Array.from(cities).sort((a, b) => a.localeCompare(b));
}

function loadExistingCentroids() {
  if (!fs.existsSync(OUTPUT_JSON)) return new Map();
  const payload = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
  const rows = payload?.cities ?? [];
  return new Map(rows.map((row) => [normalizeCity(row.city), row]));
}

async function main() {
  const cities = readCitiesFromCsv();
  const existing = loadExistingCentroids();
  const results = new Map(existing);

  for (let i = 0; i < cities.length; i += 1) {
    const city = cities[i];
    if (results.has(city)) {
      continue;
    }

    const geocoded = await geocodeCity(city);
    if (geocoded) {
      results.set(city, {
        city,
        latitude: Number(geocoded.latitude.toFixed(6)),
        longitude: Number(geocoded.longitude.toFixed(6)),
        displayName: geocoded.displayName,
        sourceQuery: geocoded.sourceQuery,
      });
    }

    process.stdout.write(`Geocoded ${i + 1}/${cities.length}: ${city}\n`);
    await sleep(REQUEST_DELAY_MS);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: INPUT_CSV,
    provider: 'OpenStreetMap Nominatim',
    count: results.size,
    cities: Array.from(results.values()).sort((a, b) => a.city.localeCompare(b.city)),
  };

  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${output.count} city centroids to ${OUTPUT_JSON}`);
}

await main();
