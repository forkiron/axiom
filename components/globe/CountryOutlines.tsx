import { Line } from "@react-three/drei";
import { useMemo } from "react";
import countryShapesGeoJson from "../../lib/data/ne_110m_admin_0_countries.json";
import type { EducationCountryMetric } from "../../lib/types";
import { latLonToCartesian } from "./geo";
import { getHeatDomain, heatColorFromValue } from "./heatColor";

interface CountryOutlinesProps {
  records?: EducationCountryMetric[];
  radius?: number;
  opacity?: number;
  colorMode?: "heat" | "white";
  strokeColor?: string;
}

function darkenHexColor(hex: string, factor = 0.78) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const channel = (start: number) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(Number.parseInt(clean.slice(start, start + 2), 16) * factor),
      ),
    );
  const r = channel(0).toString(16).padStart(2, "0");
  const g = channel(2).toString(16).padStart(2, "0");
  const b = channel(4).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function CountryOutlines({
  records = [],
  radius = 1.0049,
  opacity = 0.78,
  colorMode = "heat",
  strokeColor = "#f5f7fb",
}: CountryOutlinesProps) {
  const paths = useMemo(() => {
    const featureCollection = countryShapesGeoJson as {
      features: Array<{
        properties?: {
          ISO_A3?: string;
        };
        geometry: {
          type: "Polygon" | "MultiPolygon";
          coordinates: number[][][] | number[][][][];
        };
      }>;
    };
    const recordByIso3 = new Map(
      records.map((record) => [record.iso3, record] as const),
    );
    const { minHeat, maxHeat } = getHeatDomain(records);

    const linePaths: Array<{
      id: string;
      points: [number, number, number][];
      color: string;
    }> = [];

    for (const [
      featureIndex,
      feature,
    ] of featureCollection.features.entries()) {
      const iso3 = feature.properties?.ISO_A3 ?? "";
      const record = iso3 ? recordByIso3.get(iso3) : null;
      const borderColor =
        colorMode === "white"
          ? strokeColor
          : darkenHexColor(
              heatColorFromValue(record?.heatScore ?? null, minHeat, maxHeat),
            );
      if (feature.geometry.type === "Polygon") {
        const polygon = feature.geometry.coordinates as number[][][];
        polygon.forEach((ring, ringIndex) => {
          if (ring.length > 1) {
            linePaths.push({
              id: `${featureIndex}-${iso3 || 'na'}-p-${ringIndex}`,
              color: borderColor,
              points: ring.map((coordinate) => {
                const [longitude, latitude] = coordinate;
                return latLonToCartesian(latitude, longitude, radius);
              }),
            });
          }
        });
      } else if (feature.geometry.type === "MultiPolygon") {
        const polygons = feature.geometry.coordinates as number[][][][];
        polygons.forEach((polygon, polygonIndex) => {
          polygon.forEach((ring, ringIndex) => {
            if (ring.length > 1) {
              linePaths.push({
                id: `${featureIndex}-${iso3 || 'na'}-m-${polygonIndex}-${ringIndex}`,
                color: borderColor,
                points: ring.map((coordinate) => {
                  const [longitude, latitude] = coordinate;
                  return latLonToCartesian(latitude, longitude, radius);
                }),
              });
            }
          });
        });
      }
    }

    return linePaths;
  }, [colorMode, records, radius, strokeColor]);

  return (
    <group>
      {paths.map((path) => (
        <Line
          key={path.id}
          points={path.points}
          color={path.color}
          transparent
          opacity={opacity}
          lineWidth={3}
          depthTest
          toneMapped={false}
        />
      ))}
    </group>
  );
}
