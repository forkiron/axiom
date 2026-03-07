export type AppView = 'world' | 'canada';

export interface TransitionState {
  active: boolean;
  target: AppView | null;
}

export interface MapCameraState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface GlobeCountryMarker {
  id: string;
  countryCode: string;
  label: string;
  latitude: number;
  longitude: number;
  size?: number;
  color?: string;
}

export interface ProvinceDatum {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  intensity: number;
}

export interface SchoolMetrics {
  averageGrade: number;
  adjustmentFactor: number;
  testMetric: number;
  standardizedScore: number;
}

export interface SchoolDatum {
  id: string;
  name: string;
  city: string;
  provinceSlug: string;
  latitude: number;
  longitude: number;
  // optional pre‑computed metrics for GPA etc.
  metrics?: SchoolMetrics;
  // difficulty ratings on a 1–10 scale for each subject
  difficulty?: {
    math: number;
    physics: number;
    english: number;
  };
}

export interface EducationCountryMetric {
  iso3: string;
  iso2: string | null;
  country: string;
  csvCountryHeat: string | null;
  csvCountryExtrusion: string | null;
  publicEducationScore: number | null;
  top20Rank2026: number | null;
  heatScore: number | null;
  heatSource: string | null;
  extrusionValue: number | null;
  extrusionYear: number | null;
  extrusionScore: number | null;
}

export interface EducationCountryDataset {
  generatedAt: string;
  sources: {
    heat: string;
    extrusion: string;
    extrusionMethod: string;
  };
  stats: {
    countriesWithShapes: number;
    withHeat: number;
    withExtrusion: number;
    minExtrusion: number;
    maxExtrusion: number;
  };
  records: EducationCountryMetric[];
}
