import fs from 'node:fs';

const PROVINCE_CONFIG = {
  ON: {
    code: 'ON',
    name: 'Ontario',
    inputCsv: 'data/csv/provincial/ontario_747_schools.csv',
    outputJson: 'lib/data/on-school-rankings.json',
    fallbackBounds: {
      minLat: 41.7,
      maxLat: 56.9,
      minLon: -95.2,
      maxLon: -74.2,
    },
    cityAliases: {
      'St Catharines': 'St. Catharines',
      'Sault Ste Marie': 'Sault Ste. Marie',
      'Niagara On The Lake': 'Niagara-on-the-Lake',
      'Fort Frances': 'Fort Frances',
    },
    cityAnchors: {
      Toronto: [43.6532, -79.3832],
      Ottawa: [45.4215, -75.6972],
      Hamilton: [43.2557, -79.8711],
      London: [42.9849, -81.2453],
      Kitchener: [43.4516, -80.4925],
      Waterloo: [43.4643, -80.5204],
      Windsor: [42.3149, -83.0364],
      'St. Catharines': [43.1594, -79.2469],
      Kingston: [44.2312, -76.486],
      'Sault Ste. Marie': [46.5219, -84.3461],
      Sudbury: [46.4917, -80.993],
      Thunder: [48.3809, -89.2477],
      'Thunder Bay': [48.3809, -89.2477],
      Barrie: [44.3894, -79.6903],
      Markham: [43.8561, -79.337],
      Vaughan: [43.8361, -79.4983],
      Brampton: [43.7315, -79.7624],
      Mississauga: [43.589, -79.6441],
      Oakville: [43.4675, -79.6877],
      Burlington: [43.3255, -79.799],
      'North Bay': [46.3091, -79.4608],
      Guelph: [43.5448, -80.2482],
      Peterborough: [44.3091, -78.3197],
      Oshawa: [43.8971, -78.8658],
      Whitby: [43.8975, -78.9429],
      Pickering: [43.8384, -79.0868],
      Richmond: [43.8828, -79.44],
      'Richmond Hill': [43.8828, -79.44],
      Ajax: [43.8509, -79.0204],
      Milton: [43.5183, -79.8774],
      Cambridge: [43.3616, -80.3144],
      Brantford: [43.1394, -80.2644],
      Guelph: [43.5448, -80.2482],
      Niagara: [43.1594, -79.2469],
      'Niagara Falls': [43.0896, -79.0849],
      'Niagara-on-the-Lake': [43.2542, -79.072],
      Lindsay: [44.3534, -78.7428],
      Belleville: [44.1628, -77.3832],
      Cornwall: [45.0185, -74.7281],
      Brockville: [44.591, -75.6876],
      Stratford: [43.3702, -80.9829],
      Orillia: [44.6087, -79.4192],
      Timmins: [48.4758, -81.3305],
      Kenora: [49.767, -94.4893],
      Dryden: [49.7834, -92.8377],
      Orangeville: [43.9198, -80.0943],
      Collingwood: [44.5008, -80.2169],
      Chatham: [42.4048, -82.191],
      Sarnia: [42.9745, -82.4066],
      Leamington: [42.0501, -82.5994],
      Napanee: [44.248, -76.95],
      Trenton: [44.1016, -77.5767],
      Cobourg: [43.9593, -78.1677],
      'Port Hope': [43.9515, -78.2943],
      Newmarket: [44.0592, -79.4613],
      Aurora: [44.0065, -79.4504],
      Stouffville: [43.9707, -79.2496],
      Caledon: [43.8668, -79.8666],
      Kanata: [45.3003, -75.9272],
      Nepean: [45.3443, -75.7707],
      Gloucester: [45.3141, -75.6067],
      'Fort Frances': [48.609, -93.394],
      'Sioux Lookout': [50.1001, -91.9192],
      Iroquois: [44.8458, -75.3079],
      Elliot: [46.3834, -82.6505],
      'Elliot Lake': [46.3834, -82.6505],
      Owen: [44.569, -80.9406],
      'Owen Sound': [44.569, -80.9406],
    },
  },
  NL: {
    code: 'NL',
    name: 'Newfoundland and Labrador',
    inputCsv: 'data/csv/provincial/nl_schools.csv',
    outputJson: 'lib/data/nl-school-rankings.json',
    fallbackBounds: {
      minLat: 46.5,
      maxLat: 60.4,
      minLon: -64.2,
      maxLon: -52.1,
    },
    cityAliases: {
      'St Johns': "St. John's",
      'Happy Valley Goose Bay': 'Happy Valley-Goose Bay',
      'Wabush Labrador': 'Wabush',
    },
    cityAnchors: {
      "St. John's": [47.5615, -52.7126],
      Mount: [47.5167, -52.7814],
      'Mount Pearl': [47.5167, -52.7814],
      Corner: [48.95, -57.95],
      'Corner Brook': [48.95, -57.95],
      Gander: [48.9568, -54.6086],
      Grand: [48.9315, -55.6654],
      'Grand Falls-Windsor': [48.9315, -55.6654],
      Labrador: [52.9399, -66.9112],
      'Labrador City': [52.9399, -66.9112],
      Happy: [53.3017, -60.3353],
      'Happy Valley-Goose Bay': [53.3017, -60.3353],
      Stephenville: [48.55, -58.5667],
      Clarenville: [48.1632, -53.9644],
      Deer: [49.1736, -57.4316],
      'Deer Lake': [49.1736, -57.4316],
      Pasadena: [49.0123, -57.5985],
      Twillingate: [49.6499, -54.7604],
      Milltown: [47.3072, -55.8667],
      'Port Saunders': [50.4322, -57.2458],
      Carbonear: [47.7333, -53.2333],
      Bay: [47.3068, -54.1788],
      'Bay Roberts': [47.5958, -53.2648],
    },
  },
  NS: {
    code: 'NS',
    name: 'Nova Scotia',
    inputCsv: 'data/csv/provincial/ns_schools.csv',
    outputJson: 'lib/data/ns-school-rankings.json',
    fallbackBounds: {
      minLat: 43.2,
      maxLat: 47.2,
      minLon: -66.5,
      maxLon: -59.1,
    },
    cityAliases: {
      Dartmouth: 'Dartmouth',
      'Southwest Mabou': 'Mabou',
      'Terre Noire': 'Terre Noire',
      Freeport: 'Freeport',
    },
    cityAnchors: {
      Halifax: [44.6488, -63.5752],
      Dartmouth: [44.6713, -63.5772],
      Bedford: [44.7304, -63.66],
      Sydney: [46.1368, -60.1942],
      Truro: [45.3656, -63.2797],
      New: [44.9901, -64.4846],
      Glasgow: [45.5885, -62.6454],
      'New Glasgow': [45.5885, -62.6454],
      Kentville: [45.0788, -64.4957],
      Amherst: [45.8346, -64.2045],
      Bridgewater: [44.3789, -64.5192],
      Yarmouth: [43.8374, -66.1174],
      Antigonish: [45.6169, -61.9931],
      Lunenburg: [44.377, -64.3095],
      Digby: [44.6208, -65.7575],
      Inverness: [46.2328, -61.3074],
      Wolfville: [45.0907, -64.3648],
      Sackville: [44.7778, -63.6836],
      Mahone: [44.4474, -64.3775],
      'Mahone Bay': [44.4474, -64.3775],
      Shelburne: [43.7668, -65.3235],
      Freeport: [44.2664, -66.1742],
      Terre: [46.7067, -60.5023],
      Mabou: [46.0667, -61.4],
    },
  },
  PEI: {
    code: 'PEI',
    name: 'Prince Edward Island',
    inputCsv: 'data/csv/provincial/pei_schools.csv',
    outputJson: 'lib/data/pei-school-rankings.json',
    fallbackBounds: {
      minLat: 45.9,
      maxLat: 47.2,
      minLon: -64.6,
      maxLon: -61.8,
    },
    cityAliases: {
      Charlottetown: 'Charlottetown',
      Souris: 'Souris',
      Morell: 'Morell',
      'North Wiltshire': 'North Wiltshire',
    },
    cityAnchors: {
      Charlottetown: [46.2382, -63.1311],
      Summerside: [46.3959, -63.7906],
      Montague: [46.1668, -62.6497],
      Souris: [46.3543, -62.2486],
      Morell: [46.4339, -62.7096],
      Kensington: [46.436, -63.6392],
      Cornwall: [46.2265, -63.2188],
      Stratford: [46.22, -63.0884],
      Alberton: [46.8161, -64.0619],
      OLeary: [46.7107, -64.2289],
      "O'Leary": [46.7107, -64.2289],
      Tignish: [46.9507, -64.0409],
      Hunter: [46.396, -63.49],
      'North Wiltshire': [46.3042, -63.2705],
    },
  },
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
  if (!normalized || normalized === 'n/a' || normalized === 'na' || normalized === '-' || normalized === '—') {
    return null;
  }
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSchoolName(schoolName) {
  return String(schoolName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCity(config, city) {
  const normalized = String(city ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '.')
    .trim();
  return config.cityAliases[normalized] ?? normalized;
}

function getCityBaseCoordinate(config, city) {
  if (config.cityAnchors[city]) {
    return {
      latitude: config.cityAnchors[city][0],
      longitude: config.cityAnchors[city][1],
      coordinateSource: 'city-anchor+jitter',
    };
  }

  const anchorList = Object.entries(config.cityAnchors);
  const anchorIndex = hashString(`anchor:${config.code}:${city}`) % anchorList.length;
  const [, selectedAnchor] = anchorList[anchorIndex];
  const latSpread = (hashUnit(`city-lat:${config.code}:${city}`) - 0.5) * 1.1;
  const lonSpread = (hashUnit(`city-lon:${config.code}:${city}`) - 0.5) * 1.5;

  return {
    latitude: clamp(selectedAnchor[0] + latSpread, config.fallbackBounds.minLat, config.fallbackBounds.maxLat),
    longitude: clamp(selectedAnchor[1] + lonSpread, config.fallbackBounds.minLon, config.fallbackBounds.maxLon),
    coordinateSource: 'city-derived-anchor+jitter',
  };
}

function getSchoolCoordinate(config, city, schoolName) {
  const cityBase = getCityBaseCoordinate(config, city);
  const latOffset = (hashUnit(`school-lat:${config.code}:${city}:${schoolName}`) - 0.5) * 0.12;
  const lonOffset = (hashUnit(`school-lon:${config.code}:${city}:${schoolName}`) - 0.5) * 0.16;

  return {
    latitude: Number(clamp(cityBase.latitude + latOffset, config.fallbackBounds.minLat, config.fallbackBounds.maxLat).toFixed(6)),
    longitude: Number(clamp(cityBase.longitude + lonOffset, config.fallbackBounds.minLon, config.fallbackBounds.maxLon).toFixed(6)),
    coordinateSource: cityBase.coordinateSource,
  };
}

function readRows(config) {
  const csv = fs.readFileSync(config.inputCsv, 'utf8').replace(/^\uFEFF/, '');
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);

  const col = (name) => headers.indexOf(name);
  const colAny = (...names) => names.map((name) => col(name)).find((index) => index !== -1) ?? -1;

  const provinceCol = colAny('province', 'Province');
  const schoolCol = colAny('school_name', 'School Name');
  const cityCol = colAny('city', 'City');
  const rankCol = colAny('rank_2019', 'rank_2023_2024', 'rank_2024', 'rank');
  const rank5yrCol = colAny('rank_5yr', 'rank5yr');
  const trendCol = colAny('trend', 'Trend');
  const ratingCol = colAny('overall_rating_2019', 'overall_rating_2023_2024', 'overall_rating_2024', 'overall_rating');
  const rating5yrCol = colAny('overall_rating_5yr', 'overall_rating_5_year');
  const sourceCol = colAny('source', 'Source');

  if (schoolCol === -1 || cityCol === -1) {
    throw new Error(`Missing required CSV columns in ${config.inputCsv}. Expected school_name and city.`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parsed = parseCsvLine(lines[i]);
    const schoolName = normalizeSchoolName(parsed[schoolCol]);
    const city = normalizeCity(config, parsed[cityCol]);
    if (!schoolName || !city) continue;

    const provinceValue = String(provinceCol === -1 ? config.code : parsed[provinceCol] ?? config.code)
      .trim()
      .toUpperCase();

    const coordinate = getSchoolCoordinate(config, city, schoolName);

    rows.push({
      id: `${config.code.toLowerCase()}-${hashString(`${schoolName}:${city}`).toString(36)}`,
      schoolName,
      city,
      province: provinceValue || config.code,
      rank: parseOptionalNumber(rankCol === -1 ? null : parsed[rankCol]),
      rank5yr: parseOptionalNumber(rank5yrCol === -1 ? null : parsed[rank5yrCol]),
      trend: trendCol === -1 ? null : String(parsed[trendCol] ?? '').trim() || null,
      rating: parseOptionalNumber(ratingCol === -1 ? null : parsed[ratingCol]),
      rating5yr: parseOptionalNumber(rating5yrCol === -1 ? null : parsed[rating5yrCol]),
      source: sourceCol === -1 ? null : String(parsed[sourceCol] ?? '').trim() || null,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      coordinateSource: coordinate.coordinateSource,
    });
  }

  return rows;
}

function summarizeCoordinateSources(schools) {
  const sourceBreakdown = {};
  for (const school of schools) {
    sourceBreakdown[school.coordinateSource] = (sourceBreakdown[school.coordinateSource] ?? 0) + 1;
  }
  return sourceBreakdown;
}

function buildProvince(provinceCode) {
  const normalizedCode = String(provinceCode ?? '').trim().toUpperCase();
  const config = PROVINCE_CONFIG[normalizedCode];
  if (!config) {
    const supported = Object.keys(PROVINCE_CONFIG).join(', ');
    throw new Error(`Unsupported province code "${provinceCode}". Supported values: ${supported}`);
  }

  const schools = readRows(config);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: config.inputCsv,
    notes: `Coordinates are approximated from ${config.name} city anchors and deterministic jitter per school (BC-style pipeline).`,
    count: schools.length,
    sourceBreakdown: summarizeCoordinateSources(schools),
    schools,
  };

  fs.mkdirSync('lib/data', { recursive: true });
  fs.writeFileSync(config.outputJson, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${payload.count} ${config.code} schools to ${config.outputJson}`);
}

const requestedProvinceCode = process.argv[2] ?? 'ON';
buildProvince(requestedProvinceCode);
