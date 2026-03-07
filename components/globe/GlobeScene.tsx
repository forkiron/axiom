'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import type { Group } from 'three';
import educationDataset from '../../lib/data/country-education-metrics.json';
import type { EducationCountryDataset, EducationCountryMetric } from '../../lib/types';
import { CountryOutlines } from './CountryOutlines';
import { CountryShapeExtrusions } from './CountryShapeExtrusions';
import { EarthMesh } from './EarthMesh';
import { GlobeLights } from './GlobeLights';

interface GlobeSceneProps {
  className?: string;
  onCountrySelect?: (countryCode: string) => void;
  onCanadaSelect?: () => void;
}

function RotatingWorld({
  records,
  hoveredIso3,
  onMetricHover,
  onCountrySelect,
  scale = 1,
}: {
  records: EducationCountryMetric[];
  hoveredIso3: string | null;
  onMetricHover: (record: EducationCountryMetric | null) => void;
  onCountrySelect?: (countryCode: string) => void;
  scale?: number;
}) {
  const worldRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!worldRef.current) return;
    worldRef.current.rotation.y += delta * 0.07;
  });

  return (
    <group ref={worldRef} scale={scale}>
      <EarthMesh />
      <CountryOutlines records={records} />
      <CountryShapeExtrusions
        records={records}
        selectedIso3={hoveredIso3}
        onCountryHover={(record) => {
          onMetricHover(record);
          if (record) {
            onCountrySelect?.(record.iso2 ?? record.iso3);
          }
        }}
      />
    </group>
  );
}

export function GlobeScene({
  className,
  onCountrySelect,
}: GlobeSceneProps) {
  const worldScale = 0.84;
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
  const typedDataset = educationDataset as EducationCountryDataset;

  const records = useMemo(
    () => typedDataset.records,
    [typedDataset.records]
  );

  const selectedRecord = useMemo(
    () => records.find((record) => record.iso3 === hoveredIso3) ?? null,
    [records, hoveredIso3]
  );

  const globalSummary = useMemo(() => {
    const heatValues = records
      .map((record) => record.heatScore)
      .filter((value): value is number => typeof value === 'number');
    const extrusionValues = records
      .map((record) => record.extrusionScore)
      .filter((value): value is number => typeof value === 'number');

    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

    return {
      averageHeat: average(heatValues),
      averageExtrusion: average(extrusionValues),
    };
  }, [records]
  );

  return (
    <div
      className={`relative min-h-[520px] overflow-hidden rounded-xl border border-white/10 bg-black ${className ?? ''}`}
    >
      <Canvas
        camera={{ position: [0, 0, 2.38], fov: 40 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#010101']} />
        <fog attach="fog" args={['#010101', 2.8, 6.5]} />
        <Suspense fallback={null}>
          <GlobeLights />
          <Stars radius={120} depth={60} count={1100} factor={2.2} saturation={0} fade speed={0.12} />
          <RotatingWorld
            records={records}
            hoveredIso3={hoveredIso3}
            onMetricHover={(record) => setHoveredIso3(record?.iso3 ?? null)}
            onCountrySelect={onCountrySelect}
            scale={worldScale}
          />
          <OrbitControls
            enablePan={false}
            minDistance={1.85}
            maxDistance={2.95}
            rotateSpeed={0.32}
            minPolarAngle={Math.PI * 0.28}
            maxPolarAngle={Math.PI * 0.72}
          />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(0,0,0,0.58)_100%)]" />

    </div>
  );
}
