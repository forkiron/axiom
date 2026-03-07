'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import MapboxMap, {
  Layer as MapboxLayer,
  NavigationControl as MapboxNavigationControl,
  ScaleControl as MapboxScaleControl,
  Source as MapboxSource,
  Marker as MapboxMarker,
} from 'react-map-gl/mapbox';
import MapLibreMap, {
  Layer as MapLibreLayer,
  NavigationControl as MapLibreNavigationControl,
  ScaleControl as MapLibreScaleControl,
  Source as MapLibreSource,
  Marker as MapLibreMarker,
} from 'react-map-gl/maplibre';
import countryShapesGeoJson from '../../lib/data/ne_110m_admin_0_countries.json';
import educationDataset from '../../lib/data/country-education-metrics.json';
import bcSchoolDataset from '../../lib/data/bc-school-rankings.json';
import type { EducationCountryDataset } from '../../lib/types';
import { getHeatDomain, heatColorFromValue } from './heatColor';
import { MAP_STYLE_URL } from '../../lib/constants';
import { SchoolDetailsPanel } from './SchoolDetailsPanel';

interface WorldGlobeMapProps {
  className?: string;
}

type LayerMode = 'terrain' | 'academic' | 'bc-schools';

interface CountryFocusPoint {
  latitude: number;
  longitude: number;
  zoom: number;
}

interface BcSchoolRecord {
  id: string;
  schoolName: string;
  city: string;
  rank: number;
  rating: number;
  latitude: number;
  longitude: number;
}

const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const PLACEHOLDER_TOKENS = new Set([
  '',
  'your_mapbox_public_token_here',
  'YOUR_MAPBOX_PUBLIC_TOKEN',
]);

const BUILDINGS_LAYER: any = {
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', ['get', 'extrude'], 'true'],
  type: 'fill-extrusion',
  minzoom: 14.5,
  paint: {
    'fill-extrusion-color': '#d8e4f8',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-opacity': 0.22,
  },
};

const BC_HEAT_LAYER: any = {
  id: 'bc-school-heat',
  type: 'heatmap',
  paint: {
    'heatmap-weight': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'rating'], 0],
      0,
      0.05,
      10,
      1,
    ],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 8, 1.2, 12, 1.7],
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(0, 0, 0, 0)',
      0.2,
      '#2a9d8f',
      0.4,
      '#f4d35e',
      0.6,
      '#f08a24',
      0.8,
      '#d62828',
      1,
      '#7f0000',
    ],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 18, 8, 32, 12, 48],
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.85, 12, 0.45, 14, 0.05],
  },
};

const BC_POINT_LAYER: any = {
  id: 'bc-school-points',
  type: 'circle',
  minzoom: 6.5,
  paint: {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      6.5,
      ['interpolate', ['linear'], ['coalesce', ['get', 'rating'], 0], 0, 2, 10, 5],
      12,
      ['interpolate', ['linear'], ['coalesce', ['get', 'rating'], 0], 0, 4, 10, 9],
    ],
    'circle-color': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'rating'], 0],
      0,
      '#7f0000',
      5,
      '#f4d35e',
      10,
      '#16c768',
    ],
    'circle-opacity': 0.94,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#111827',
  },
};

const BC_LABEL_LAYER: any = {
  id: 'bc-school-labels',
  type: 'symbol',
  minzoom: 10.5,
  layout: {
    'text-field': ['get', 'schoolName'],
    'text-size': 10,
    'text-offset': [0, 1.1],
    'text-anchor': 'top',
  },
  paint: {
    'text-color': '#f8fafc',
    'text-halo-color': 'rgba(0,0,0,0.8)',
    'text-halo-width': 1,
  },
};

function countryZoomForExtent(extent: number): number {
  const normalized = Math.min(1, Math.max(0, (extent - 4) / 72));
  return 5.8 - normalized * 3.2;
}

function buildCountryFocusMap(): Map<string, CountryFocusPoint> {
  const map = new Map<string, CountryFocusPoint>();
  const collection = countryShapesGeoJson as unknown as {
    features: Array<{
      properties?: { ISO_A3?: string; LABEL_X?: number; LABEL_Y?: number };
      bbox?: number[];
      geometry?: { coordinates?: unknown };
    }>;
  };

  for (const feature of collection.features) {
    const iso3 = feature.properties?.ISO_A3;
    if (!iso3 || iso3 === '-99') continue;

    const collected: [number, number][] = [];
    const collectCoordinates = (input: any) => {
      if (!Array.isArray(input) || input.length === 0) return;
      if (typeof input[0] === 'number') {
        collected.push([Number(input[0]), Number(input[1])]);
        return;
      }
      for (const child of input) collectCoordinates(child);
    };

    collectCoordinates(feature.geometry?.coordinates);
    if (!collected.length) continue;

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    let lngSum = 0;
    let latSum = 0;

    for (const [lng, lat] of collected) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
      lngSum += lng;
      latSum += lat;
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) continue;

    const extentFromPoints = Math.max(maxLat - minLat, maxLng - minLng);
    const bbox = feature.bbox;
    const extentFromBBox =
      bbox && bbox.length === 4
        ? Math.max(Number(bbox[3]) - Number(bbox[1]), Number(bbox[2]) - Number(bbox[0]))
        : extentFromPoints;
    const extent = Number.isFinite(extentFromBBox) ? extentFromBBox : extentFromPoints;

    const fallbackLongitude = lngSum / collected.length;
    const fallbackLatitude = latSum / collected.length;
    const labelLongitude = feature.properties?.LABEL_X;
    const labelLatitude = feature.properties?.LABEL_Y;

    map.set(iso3, {
      longitude: Number.isFinite(labelLongitude) ? Number(labelLongitude) : fallbackLongitude,
      latitude: Number.isFinite(labelLatitude) ? Number(labelLatitude) : fallbackLatitude,
      zoom: countryZoomForExtent(extent),
    });
  }

  return map;
}

const COUNTRY_FOCUS_MAP = buildCountryFocusMap();

function darkenHexColor(hex: string, factor = 0.78) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const channel = (start: number) =>
    Math.max(0, Math.min(255, Math.round(Number.parseInt(clean.slice(start, start + 2), 16) * factor)));
  const r = channel(0).toString(16).padStart(2, '0');
  const g = channel(2).toString(16).padStart(2, '0');
  const b = channel(4).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function getRatingColor(rating: number) {
  const value = Math.max(0, Math.min(10, rating));
  const hex = (c: string) => Number.parseInt(c.slice(1), 16);
  const interpolate = (c1: string, c2: string, t: number) => {
    const r1 = (hex(c1) >> 16) & 255, g1 = (hex(c1) >> 8) & 255, b1 = hex(c1) & 255;
    const r2 = (hex(c2) >> 16) & 255, g2 = (hex(c2) >> 8) & 255, b2 = hex(c2) & 255;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
  };
  
  if (value < 5) return interpolate('#7f0000', '#f4d35e', value / 5);
  return interpolate('#f4d35e', '#16c768', (value - 5) / 5);
}

function getUnderlyingMap(refObject: any) {
  return refObject?.current?.getMap?.() ?? refObject?.current ?? null;
}

function setProjectionForMode(mapInstance: any, mode: LayerMode) {
  if (!mapInstance?.setProjection) return;
  const projection = mode === 'bc-schools' ? 'mercator' : 'globe';
  try {
    mapInstance.setProjection(projection);
  } catch {
    if (projection === 'globe') {
      try {
        mapInstance.setProjection('mercator');
      } catch {
        // noop: keep existing projection if changing is unsupported
      }
    }
  }
}

export function WorldGlobeMap({ className }: WorldGlobeMapProps) {
  const [activeLayer, setActiveLayer] = useState<LayerMode>('terrain');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [isSchoolSearchOpen, setIsSchoolSearchOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<BcSchoolRecord | null>(null);
  const token = MAPBOX_TOKEN.trim();
  const hasMapboxToken =
    token.length > 0 &&
    !PLACEHOLDER_TOKENS.has(token) &&
    !token.toLowerCase().startsWith('your_');

  const mapboxRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);

  const typedDataset = educationDataset as EducationCountryDataset;
  const records = typedDataset.records;
  const bcSchools = (bcSchoolDataset as { schools: BcSchoolRecord[] }).schools;

  const fillColorExpression = useMemo(() => {
    const { minHeat, maxHeat } = getHeatDomain(records);
    const expression: any[] = ['match', ['get', 'ISO_A3']];
    for (const record of records) {
      expression.push(record.iso3, heatColorFromValue(record.heatScore, minHeat, maxHeat));
    }
    expression.push('rgba(0, 0, 0, 0)');
    return expression;
  }, [records]);

  const borderColorExpression = useMemo(() => {
    const { minHeat, maxHeat } = getHeatDomain(records);
    const expression: any[] = ['match', ['get', 'ISO_A3']];
    for (const record of records) {
      expression.push(record.iso3, darkenHexColor(heatColorFromValue(record.heatScore, minHeat, maxHeat)));
    }
    expression.push('rgba(0, 0, 0, 0)');
    return expression;
  }, [records]);

  const bcSchoolGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: bcSchools.map((school) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [school.longitude, school.latitude],
        },
        properties: {
          id: school.id,
          schoolName: school.schoolName,
          city: school.city,
          rating: school.rating,
          rank: school.rank,
        },
      })),
    }),
    [bcSchools]
  );

  const bcBounds = useMemo(() => {
    if (!bcSchools.length) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    for (const school of bcSchools) {
      if (!Number.isFinite(school.longitude) || !Number.isFinite(school.latitude)) continue;
      minLng = Math.min(minLng, school.longitude);
      minLat = Math.min(minLat, school.latitude);
      maxLng = Math.max(maxLng, school.longitude);
      maxLat = Math.max(maxLat, school.latitude);
    }

    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as [[number, number], [number, number]];
  }, [bcSchools]);

  const schoolSearchResults = useMemo(() => {
    const query = schoolQuery.trim().toLowerCase();
    const ranked = bcSchools.filter(
      (school) => Number.isFinite(school.longitude) && Number.isFinite(school.latitude)
    );

    if (!query) {
      return ranked
        .slice()
        .sort((a, b) => a.rank - b.rank || b.rating - a.rating)
        .slice(0, 8);
    }

    const score = (school: BcSchoolRecord) => {
      const schoolName = school.schoolName.toLowerCase();
      const city = school.city.toLowerCase();
      if (schoolName === query) return 0;
      if (schoolName.startsWith(query)) return 1;
      if (city === query) return 2;
      if (`${schoolName} ${city}`.includes(query)) return 3;
      if (city.includes(query)) return 4;
      return 10;
    };

    return ranked
      .filter((school) => score(school) < 10)
      .sort((a, b) => score(a) - score(b) || a.rank - b.rank || b.rating - a.rating)
      .slice(0, 8);
  }, [bcSchools, schoolQuery]);

  const flyToCanada = useCallback((mapInstance: any) => {
    if (!mapInstance) return;
    if (bcBounds) {
      mapInstance.fitBounds(bcBounds, {
        padding: { top: 80, right: 80, bottom: 80, left: 80 },
        duration: 1600,
        essential: true,
      });
      return;
    }
    mapInstance.flyTo({
      center: [-123.5, 53.5],
      zoom: 5.5,
      pitch: 35,
      bearing: 0,
      duration: 1800,
      essential: true,
    });
  }, [bcBounds]);

  const flyToWorld = useCallback((mapInstance: any) => {
    if (!mapInstance) return;
    mapInstance.flyTo({
      center: [0, 22],
      zoom: 1.6,
      pitch: 42,
      bearing: 0,
      duration: 1300,
      essential: true,
    });
  }, []);

  const flyToCountry = useCallback((mapInstance: any, iso3: string) => {
    if (!mapInstance) return;
    const focus = COUNTRY_FOCUS_MAP.get(iso3);
    if (!focus) return;

    mapInstance.flyTo({
      center: [focus.longitude, focus.latitude],
      zoom: focus.zoom,
      pitch: 42,
      bearing: 0,
      duration: 1400,
      essential: true,
    });
  }, []);

  const flyToSchool = useCallback((mapInstance: any, school: BcSchoolRecord) => {
    if (!mapInstance) return;
    mapInstance.flyTo({
      center: [school.longitude, school.latitude],
      zoom: 12.4,
      pitch: 50,
      bearing: -15,
      duration: 1500,
      essential: true,
    });
  }, []);

  const handleModeChange = useCallback(
    (mode: LayerMode) => {
      setActiveLayer(mode);
      setIsSchoolSearchOpen(false);
      setSelectedSchool(null);
      const activeMap = hasMapboxToken ? getUnderlyingMap(mapboxRef) : getUnderlyingMap(maplibreRef);
      setProjectionForMode(activeMap, mode);
      if (mode === 'bc-schools') {
        flyToCanada(activeMap);
      } else {
        flyToWorld(activeMap);
      }
    },
    [hasMapboxToken, flyToCanada, flyToWorld]
  );

  const handleSchoolSelect = useCallback(
    (school: BcSchoolRecord) => {
      setSchoolQuery(`${school.schoolName} (${school.city})`);
      setIsSchoolSearchOpen(false);
      setActiveLayer('bc-schools');
      setSelectedSchool(school);

      requestAnimationFrame(() => {
        const activeMap = hasMapboxToken ? getUnderlyingMap(mapboxRef) : getUnderlyingMap(maplibreRef);
        setProjectionForMode(activeMap, 'bc-schools');
        flyToSchool(activeMap, school);
      });
    },
    [hasMapboxToken, flyToSchool]
  );

  const handleSchoolSearchSubmit = useCallback(
    (event: any) => {
      event.preventDefault();
      const firstResult = schoolSearchResults[0];
      if (!firstResult) return;
      handleSchoolSelect(firstResult);
    },
    [handleSchoolSelect, schoolSearchResults]
  );

  const handleMapClick = useCallback(
    (event: any, isMapbox: boolean) => {
      setIsSchoolSearchOpen(false);
      const activeMap = isMapbox ? getUnderlyingMap(mapboxRef) : getUnderlyingMap(maplibreRef);
      const features = event?.features ?? [];
      if (!features.length || !activeMap) return;

      const schoolFeature = features.find((feature: any) => feature?.layer?.id === 'bc-school-points');
      if (schoolFeature?.geometry?.coordinates) {
        const [lng, lat] = schoolFeature.geometry.coordinates;
        setActiveLayer('bc-schools');
        setProjectionForMode(activeMap, 'bc-schools');
        
        const targetedSchool = {
          id: schoolFeature?.properties?.id ?? 'selected-school',
          schoolName: schoolFeature?.properties?.schoolName ?? 'Selected school',
          city: schoolFeature?.properties?.city ?? '',
          rank: Number(schoolFeature?.properties?.rank ?? 0),
          rating: Number(schoolFeature?.properties?.rating ?? 0),
          longitude: Number(lng),
          latitude: Number(lat),
        };
        setSelectedSchool(targetedSchool);
        flyToSchool(activeMap, targetedSchool);
        return;
      }

      const countryFeature = features.find((feature: any) => feature?.layer?.id === 'country-hit-layer');
      const iso3 = countryFeature?.properties?.ISO_A3;
      if (typeof iso3 === 'string' && iso3 && iso3 !== '-99') {
        setSelectedSchool(null);
        if (iso3 === 'CAN') {
          setActiveLayer('bc-schools');
          setProjectionForMode(activeMap, 'bc-schools');
          flyToCanada(activeMap);
          return;
        }
        flyToCountry(activeMap, iso3);
      }
    },
    [flyToCanada, flyToCountry, flyToSchool]
  );

  return (
    <div className={`relative ${className ?? ''}`}>
      {hasMapboxToken ? (
        <MapboxMap
          ref={mapboxRef}
          initialViewState={{
            longitude: 0,
            latitude: 22,
            zoom: 1.6,
            bearing: 0,
            pitch: 42,
          }}
          mapStyle={MAPBOX_STYLE}
          mapboxAccessToken={MAPBOX_TOKEN}
          maxZoom={19.2}
          minZoom={0.8}
          performanceMetricsCollection={false}
          terrain={{ source: 'mapbox-dem', exaggeration: 1.15 }}
          interactiveLayerIds={['country-hit-layer', 'bc-school-points']}
          antialias
          onClick={(event) => handleMapClick(event, true)}
          onLoad={(event) => {
            setProjectionForMode(event.target, activeLayer);
            event.target.setFog({
              color: 'rgb(7, 9, 13)',
              'high-color': 'rgb(23, 32, 48)',
              'horizon-blend': 0.22,
              'space-color': 'rgb(3, 4, 8)',
              'star-intensity': 0.38,
            });
          }}
        >
          <MapboxSource
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />

          <MapboxLayer {...BUILDINGS_LAYER} />

          <MapboxSource id="country-hit-source" type="geojson" data={countryShapesGeoJson as any}>
            <MapboxLayer
              id="country-hit-layer"
              type="fill"
              paint={{
                'fill-color': '#000000',
                'fill-opacity': 0.001,
              }}
            />
            {activeLayer === 'academic' && (
              <>
                <MapboxLayer
                  id="academic-fill"
                  type="fill"
                  source="country-hit-source"
                  paint={{
                    'fill-color': fillColorExpression as any,
                    'fill-opacity': 0.5,
                  }}
                />
                <MapboxLayer
                  id="academic-outline"
                  type="line"
                  source="country-hit-source"
                  paint={{
                    'line-color': borderColorExpression as any,
                    'line-width': 1.05,
                    'line-opacity': 0.92,
                  }}
                />
              </>
            )}
          </MapboxSource>

          {activeLayer === 'bc-schools' && (
            <MapboxSource id="bc-school-source" type="geojson" data={bcSchoolGeoJson as any}>
              <MapboxLayer {...BC_HEAT_LAYER} />
              <MapboxLayer {...BC_POINT_LAYER} />
              <MapboxLayer {...BC_LABEL_LAYER} />
            </MapboxSource>
          )}

          {selectedSchool && activeLayer === 'bc-schools' && (
            <MapboxMarker 
              longitude={selectedSchool.longitude} 
              latitude={selectedSchool.latitude}
              anchor="bottom"
            >
              <div className="flex flex-col items-center pt-8 transition-transform" style={{ marginTop: '-32px' }}>
                <div 
                  className="text-white text-xs px-2 py-1 rounded shadow-lg font-bold whitespace-nowrap mb-1 transition-colors"
                  style={{ backgroundColor: getRatingColor(selectedSchool.rating) }}
                >
                  {selectedSchool.schoolName}
                </div>
                <div 
                  className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] drop-shadow-md transition-colors"
                  style={{ borderTopColor: getRatingColor(selectedSchool.rating) }}
                ></div>
              </div>
            </MapboxMarker>
          )}

          <MapboxNavigationControl position="bottom-right" visualizePitch />
          <MapboxScaleControl position="bottom-left" />
        </MapboxMap>
      ) : (
        <MapLibreMap
          ref={maplibreRef}
          initialViewState={{
            longitude: 0,
            latitude: 22,
            zoom: 1.5,
            bearing: 0,
            pitch: 30,
          }}
          mapStyle={MAP_STYLE_URL}
          maxZoom={18}
          minZoom={0.8}
          interactiveLayerIds={['country-hit-layer', 'bc-school-points']}
          onClick={(event) => handleMapClick(event, false)}
          onLoad={(event) => setProjectionForMode(event.target, activeLayer)}
        >
          <MapLibreSource id="country-hit-source" type="geojson" data={countryShapesGeoJson as any}>
            <MapLibreLayer
              id="country-hit-layer"
              type="fill"
              paint={{
                'fill-color': '#000000',
                'fill-opacity': 0.001,
              }}
            />
            {activeLayer === 'academic' && (
              <>
                <MapLibreLayer
                  id="academic-fill"
                  type="fill"
                  source="country-hit-source"
                  paint={{
                    'fill-color': fillColorExpression as any,
                    'fill-opacity': 0.52,
                  }}
                />
                <MapLibreLayer
                  id="academic-outline"
                  type="line"
                  source="country-hit-source"
                  paint={{
                    'line-color': borderColorExpression as any,
                    'line-width': 1.05,
                    'line-opacity': 0.92,
                  }}
                />
              </>
            )}
          </MapLibreSource>

          {activeLayer === 'bc-schools' && (
            <MapLibreSource id="bc-school-source" type="geojson" data={bcSchoolGeoJson as any}>
              <MapLibreLayer {...BC_HEAT_LAYER} />
              <MapLibreLayer {...BC_POINT_LAYER} />
              <MapLibreLayer {...BC_LABEL_LAYER} />
            </MapLibreSource>
          )}

          {selectedSchool && activeLayer === 'bc-schools' && (
            <MapLibreMarker 
              longitude={selectedSchool.longitude} 
              latitude={selectedSchool.latitude}
              anchor="bottom"
            >
              <div className="flex flex-col items-center pt-8 transition-transform" style={{ marginTop: '-32px' }}>
                <div 
                  className="text-white text-xs px-2 py-1 rounded shadow-lg font-bold whitespace-nowrap mb-1 transition-colors"
                  style={{ backgroundColor: getRatingColor(selectedSchool.rating) }}
                >
                  {selectedSchool.schoolName}
                </div>
                <div 
                  className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] drop-shadow-md transition-colors"
                  style={{ borderTopColor: getRatingColor(selectedSchool.rating) }}
                ></div>
              </div>
            </MapLibreMarker>
          )}

          <MapLibreNavigationControl position="bottom-right" visualizePitch />
          <MapLibreScaleControl position="bottom-left" />
        </MapLibreMap>
      )}

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-white/15 bg-black/55 p-2 backdrop-blur">
        <button
          type="button"
          onClick={() => handleModeChange('terrain')}
          className={`rounded-md px-3 py-2 text-xs font-medium transition ${
            activeLayer === 'terrain'
              ? 'bg-white text-slate-900'
              : 'bg-transparent text-slate-200 hover:bg-white/10'
          }`}
        >
          World Terrain
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('academic')}
          className={`rounded-md px-3 py-2 text-xs font-medium transition ${
            activeLayer === 'academic'
              ? 'bg-white text-slate-900'
              : 'bg-transparent text-slate-200 hover:bg-white/10'
          }`}
        >
          Academic Overlay
        </button>
      </div>

      <form
        className="absolute right-4 top-4 z-10 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-white/15 bg-black/60 p-2 backdrop-blur"
        onSubmit={handleSchoolSearchSubmit}
      >
        <label htmlFor="bc-school-search" className="mb-1 block text-[11px] font-medium text-slate-300">
          Find School
        </label>
        <input
          id="bc-school-search"
          value={schoolQuery}
          onChange={(event) => {
            setSchoolQuery(event.target.value);
            setIsSchoolSearchOpen(true);
          }}
          onFocus={() => setIsSchoolSearchOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsSchoolSearchOpen(false);
            }
          }}
          placeholder="Type school or city (e.g. Burnaby Central)"
          className="w-full rounded-md border border-white/20 bg-black/55 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-white/55"
        />
        {isSchoolSearchOpen && schoolSearchResults.length > 0 && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-white/15 bg-black/80 p-1">
            {schoolSearchResults.map((school) => (
              <button
                key={school.id}
                type="button"
                onClick={() => handleSchoolSelect(school)}
                className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs text-slate-100 transition hover:bg-white/10"
              >
                <span className="truncate pr-2">{school.schoolName}</span>
                <span className="shrink-0 text-slate-400">{school.city}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      <SchoolDetailsPanel 
        school={selectedSchool} 
        onClose={() => setSelectedSchool(null)} 
        getRatingColor={getRatingColor}
      />
    </div>
  );
}
