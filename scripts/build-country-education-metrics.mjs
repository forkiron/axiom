import fs from 'node:fs';

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function normalize(value, min, max) {
  if (value == null || !Number.isFinite(value) || max <= min) return null;
  return ((value - min) / (max - min)) * 100;
}

function parseOptionalNumber(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseCsvFileWithHeader(filePath, headerMatcher) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerIndex = lines.findIndex((line) => headerMatcher(line));
  if (headerIndex === -1) {
    throw new Error(`Unable to find header in ${filePath}`);
  }

  const headers = parseCsvLine(lines[headerIndex]).map((header) =>
    header.replace(/^"|"$/g, '')
  );
  const rows = [];

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cols = parseCsvLine(lines[index]);
    const row = {};
    headers.forEach((header, colIndex) => {
      row[header] = (cols[colIndex] ?? '').replace(/^"|"$/g, '');
    });
    rows.push(row);
  }

  return rows;
}

function parseHeatByIso2() {
  const rows = parseCsvFileWithHeader(
    'data/csv/global/global.csv',
    (line) => line.includes('"flagCode"') && line.includes('"country"')
  );

  const ranks = rows
    .map((row) => Number(row.EducationRankingsWorldTop20_2026))
    .filter((value) => Number.isFinite(value));
  const maxRank = Math.max(...ranks);

  const heatByIso2 = new Map();

  for (const row of rows) {
    const iso2 = row.flagCode;
    if (!iso2 || iso2.length !== 2) continue;

    const publicScore = parseOptionalNumber(
      row.EducationRankings_PublicEducationSystemScoreUSNews_2024
    );
    const topRank = parseOptionalNumber(row.EducationRankingsWorldTop20_2026);

    let heatScore = null;
    let heatSource = null;

    if (publicScore != null) {
      heatScore = publicScore;
      heatSource = 'USNews2024_PublicEducationScore';
    } else if (topRank != null) {
      heatScore = ((maxRank - topRank + 1) / maxRank) * 100;
      heatSource = 'WorldTop20_2026_Rank_Derived';
    }

    heatByIso2.set(iso2, {
      csvCountry: row.country ?? null,
      heatScore,
      heatSource,
      publicEducationScore: publicScore,
      top20Rank2026: topRank,
    });
  }

  return heatByIso2;
}

function parseLatestExtrusionByIso3() {
  const rows = parseCsvFileWithHeader(
    'data/csv/global/global_extrusion.csv',
    (line) => line.includes('"Country Name"') && line.includes('"Country Code"')
  );

  const yearColumns = Object.keys(rows[0] || {})
    .filter((column) => /^\d{4}$/.test(column))
    .map((column) => Number(column))
    .sort((a, b) => b - a);

  const extrusionByIso3 = new Map();

  for (const row of rows) {
    const iso3 = row['Country Code'];
    if (!iso3 || !/^[A-Z]{3}$/.test(iso3)) continue;

    let latestYear = null;
    let latestValue = null;

    for (const year of yearColumns) {
      const raw = row[String(year)];
      const value = Number(raw);
      if (raw !== '' && Number.isFinite(value)) {
        latestYear = year;
        latestValue = value;
        break;
      }
    }

    extrusionByIso3.set(iso3, {
      csvCountry: row['Country Name'] ?? null,
      extrusionYear: latestYear,
      extrusionValue: latestValue,
    });
  }

  return extrusionByIso3;
}

function buildDataset() {
  const heatByIso2 = parseHeatByIso2();
  const extrusionByIso3 = parseLatestExtrusionByIso3();
  const geoJson = JSON.parse(
    fs.readFileSync('lib/data/ne_110m_admin_0_countries.json', 'utf8')
  );

  const records = geoJson.features
    .map((feature) => {
      const props = feature.properties ?? {};
      const iso3 = props.ISO_A3 ?? null;
      const iso2 = props.ISO_A2 ?? null;
      const name = props.NAME ?? null;

      if (!iso3 || !/^[A-Z]{3}$/.test(iso3) || iso3 === '-99') return null;

      const heat = iso2 && heatByIso2.has(iso2) ? heatByIso2.get(iso2) : null;
      const extrusion = extrusionByIso3.get(iso3) ?? null;

      return {
        iso3,
        iso2: iso2 && /^[A-Z]{2}$/.test(iso2) ? iso2 : null,
        country: name,
        csvCountryHeat: heat?.csvCountry ?? null,
        csvCountryExtrusion: extrusion?.csvCountry ?? null,
        heatScore: heat?.heatScore ?? null,
        heatSource: heat?.heatSource ?? null,
        publicEducationScore: heat?.publicEducationScore ?? null,
        top20Rank2026: heat?.top20Rank2026 ?? null,
        extrusionValue: extrusion?.extrusionValue ?? null,
        extrusionYear: extrusion?.extrusionYear ?? null,
      };
    })
    .filter(Boolean);

  const extrusionValues = records
    .map((record) => record.extrusionValue)
    .filter((value) => Number.isFinite(value));
  const minExtrusion = Math.min(...extrusionValues);
  const maxExtrusion = Math.max(...extrusionValues);

  const withScores = records.map((record) => ({
    ...record,
    extrusionScore: normalize(record.extrusionValue, minExtrusion, maxExtrusion),
  }));

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      heat: 'data/csv/global/global.csv',
      extrusion: 'data/csv/global/global_extrusion.csv',
      extrusionMethod:
        'latest non-empty value across year columns (1960-2025) for each country code',
    },
    stats: {
      countriesWithShapes: withScores.length,
      withHeat: withScores.filter((record) => record.heatScore != null).length,
      withExtrusion: withScores.filter((record) => record.extrusionScore != null).length,
      minExtrusion,
      maxExtrusion,
    },
    records: withScores,
  };
}

const outputPath = 'lib/data/country-education-metrics.json';
const payload = buildDataset();
fs.mkdirSync('lib/data', { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  `Wrote ${payload.records.length} records to ${outputPath} (heat=${payload.stats.withHeat}, extrusion=${payload.stats.withExtrusion})`
);
