import { useMemo } from 'react';
import { useCursor } from '@react-three/drei';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three';
import countryShapesGeoJson from '../../lib/data/ne_110m_admin_0_countries.json';
import type { EducationCountryMetric } from '../../lib/types';
import { latLonToCartesian } from './geo';
import { getHeatDomain, heatColorFromValue } from './heatColor';

interface CountryShapeExtrusionsProps {
  records?: EducationCountryMetric[];
  selectedIso3?: string | null;
  onCountryHover?: (record: EducationCountryMetric | null) => void;
  onCountryClick?: (record: EducationCountryMetric) => void;
  colorMode?: 'heat' | 'white';
  fillColor?: string;
  enableInteraction?: boolean;
}

type GeoJsonFeature = {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    ISO_A3?: string;
  };
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

const FLAT_COUNTRY_HEIGHT = 0.0018;

function cleanRing(ring: number[][]) {
  const out = ring
    .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (out.length < 3) return [];

  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
    out.pop();
  }
  return out.length >= 3 ? out : [];
}

function pushVector(target: number[], vector: [number, number, number]) {
  target.push(vector[0], vector[1], vector[2]);
}

function buildExtrudedPolygonGeometry(
  polygonRings: number[][][],
  baseRadius: number,
  height: number
) {
  if (!polygonRings.length) return null;

  const outer = cleanRing(polygonRings[0]);
  if (outer.length < 3) return null;

  const holes = polygonRings.slice(1).map(cleanRing).filter((ring) => ring.length >= 3);

  const outer2D = outer.map(([lon, lat]) => new Vector2(lon, lat));
  const holes2D = holes.map((ring) => ring.map(([lon, lat]) => new Vector2(lon, lat)));
  const triangles = ShapeUtils.triangulateShape(outer2D, holes2D);
  if (!triangles.length) return null;

  const rings = [outer, ...holes];
  const flatPoints = rings.flat();
  const vertexCount = flatPoints.length;
  if (!vertexCount) return null;

  const topRadius = baseRadius + height;
  const positions: number[] = [];
  const ringIndices: number[][] = [];

  let cursor = 0;
  for (const ring of rings) {
    const indices: number[] = [];
    for (const [lon, lat] of ring) {
      const base = latLonToCartesian(lat, lon, baseRadius);
      pushVector(positions, base);
      indices.push(cursor);
      cursor += 1;
    }
    ringIndices.push(indices);
  }

  for (const [lon, lat] of flatPoints) {
    const top = latLonToCartesian(lat, lon, topRadius);
    pushVector(positions, top);
  }

  const localToGlobal = ringIndices.flat();
  const indices: number[] = [];

  for (const [a, b, c] of triangles) {
    const ga = localToGlobal[a];
    const gb = localToGlobal[b];
    const gc = localToGlobal[c];
    indices.push(vertexCount + ga, vertexCount + gb, vertexCount + gc);
  }

  for (const ring of ringIndices) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      indices.push(a, b, vertexCount + b);
      indices.push(a, vertexCount + b, vertexCount + a);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function CountryShapeExtrusions({
  records = [],
  selectedIso3,
  onCountryHover,
  onCountryClick,
  colorMode = 'heat',
  fillColor = '#f3f6ff',
  enableInteraction = true,
}: CountryShapeExtrusionsProps) {
  useCursor(enableInteraction && Boolean(selectedIso3), 'pointer', 'auto');

  const meshes = useMemo(() => {
    const features = (countryShapesGeoJson as GeoJsonFeatureCollection).features;
    const recordByIso3 = new Map(
      records.map((record) => [record.iso3, record] as const)
    );
    const { minHeat, maxHeat } = getHeatDomain(records);

    const built: Array<{
      key: string;
      geometry: BufferGeometry;
      color: string;
      iso3: string;
      record?: EducationCountryMetric;
    }> = [];

    for (const [featureIndex, feature] of features.entries()) {
      const iso3 = feature.properties?.ISO_A3;
      if (!iso3) continue;
      const record = recordByIso3.get(iso3);
      if (colorMode === 'heat' && !record) continue;

      const height = FLAT_COUNTRY_HEIGHT;
      const color =
        colorMode === 'white'
          ? fillColor
          : heatColorFromValue(record?.heatScore ?? null, minHeat, maxHeat);

      if (feature.geometry.type === 'Polygon') {
        const geometry = buildExtrudedPolygonGeometry(
          feature.geometry.coordinates as number[][][],
          1.003,
          height
        );
        if (geometry) {
          built.push({
            key: `${iso3}-${featureIndex}-p-0`,
            geometry,
            color,
            iso3,
            record,
          });
        }
      } else if (feature.geometry.type === 'MultiPolygon') {
        const polygons = feature.geometry.coordinates as number[][][][];
        polygons.forEach((polygon, index) => {
          const geometry = buildExtrudedPolygonGeometry(
            polygon,
            1.003,
            height
          );
          if (geometry) {
            built.push({
              key: `${iso3}-${featureIndex}-m-${index}`,
              geometry,
              color,
              iso3,
              record,
            });
          }
        });
      }
    }

    return built;
  }, [colorMode, fillColor, records]);

  return (
    <>
      {meshes.map((mesh) => {
        const selected = selectedIso3 === mesh.iso3;
        return (
          <mesh
            key={mesh.key}
            geometry={mesh.geometry}
            onClick={enableInteraction ? (event) => {
              event.stopPropagation();
              if (!mesh.record) return;
              onCountryClick?.(mesh.record);
            } : undefined}
            onPointerOver={enableInteraction ? (event) => {
              event.stopPropagation();
              if (!mesh.record) return;
              onCountryHover?.(mesh.record);
            } : undefined}
            onPointerMove={enableInteraction ? (event) => {
              event.stopPropagation();
              if (!mesh.record) return;
              onCountryHover?.(mesh.record);
            } : undefined}
            onPointerOut={enableInteraction ? (event) => {
              event.stopPropagation();
              onCountryHover?.(null);
            } : undefined}
          >
            <meshStandardMaterial
              color={mesh.color}
              emissive={mesh.color}
              emissiveIntensity={colorMode === 'white' ? (selected ? 1.1 : 0.5) : selected ? 1.75 : 0.72}
              transparent
              opacity={colorMode === 'white' ? (selected ? 0.9 : 0.58) : selected ? 1 : 0.84}
              metalness={0.06}
              roughness={0.42}
              side={DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </>
  );
}
