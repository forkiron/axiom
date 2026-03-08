'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import educationDataset from '../../lib/data/country-education-metrics.json';
import countryShapesGeoJson from '../../lib/data/ne_110m_admin_0_countries.json';
import type { EducationCountryDataset, EducationCountryMetric } from '../../lib/types';
import { CountryOutlines } from './CountryOutlines';
import { CountryShapeExtrusions } from './CountryShapeExtrusions';
import { EarthMesh } from './EarthMesh';
import { GlobeLights } from './GlobeLights';
import { latLonToCartesian } from './geo';
import { cn } from '@/lib/utils';

/* ── types ── */

interface CountryGeo {
  centroidLat: number;
  centroidLon: number;
  angularExtent: number;
}

interface GlobeSceneProps {
  className?: string;
  onCountrySelect?: (record: EducationCountryMetric | null) => void;
  selectedIso3?: string | null;
  targetCoordinates?: { latitude: number; longitude: number } | null;
  overlayStyle?: 'academic' | 'white';
  interactive?: boolean;
  showStars?: boolean;
  transparentBackground?: boolean;
  cameraDistanceScale?: number;
}

/* ── precompute country centroids + extents from GeoJSON ── */

function computeCountryGeoMap(): Map<string, CountryGeo> {
  const map = new Map<string, CountryGeo>();
  const fc = countryShapesGeoJson as {
    features: Array<{
      properties?: { ISO_A3?: string };
      geometry: { type: string; coordinates: any };
    }>;
  };

  for (const feature of fc.features) {
    const iso3 = feature.properties?.ISO_A3;
    if (!iso3 || iso3 === '-99') continue;

    const coords: [number, number][] = [];
    const collect = (arr: any) => {
      if (typeof arr[0] === 'number') {
        coords.push([arr[0] as number, arr[1] as number]);
      } else {
        for (const child of arr) collect(child);
      }
    };
    collect(feature.geometry.coordinates);
    if (coords.length === 0) continue;

    let latSum = 0, lonSum = 0;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [lon, lat] of coords) {
      latSum += lat;
      lonSum += lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    map.set(iso3, {
      centroidLat: latSum / coords.length,
      centroidLon: lonSum / coords.length,
      angularExtent: Math.max(maxLat - minLat, maxLon - minLon),
    });
  }

  return map;
}

const COUNTRY_GEO_MAP = computeCountryGeoMap();

function zoomDistanceForExtent(angularExtent: number, scale: number): number {
  // Small countries (< 5°) → very close, large countries (> 60°) → further out
  const minDist = 1.3;
  const maxDist = 2.0;
  const t = Math.min(1, Math.max(0, (angularExtent - 3) / 65));
  return (minDist + t * (maxDist - minDist)) * scale;
}

/* ── camera animation + orbit controls manager ── */

const LERP_SPEED = 2.8;
const WORLD_DISTANCE = 2.38;

function CameraController({
  targetIso3,
  targetCoordinates,
  worldScale,
  interactive,
  cameraDistanceScale,
}: {
  targetIso3: string | null;
  targetCoordinates?: { latitude: number; longitude: number } | null;
  worldScale: number;
  interactive: boolean;
  cameraDistanceScale: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const targetPos = useRef(new Vector3());
  const targetPoint = useRef(new Vector3(0, 0, 0));
  const isAnimating = useRef(false);
  const [isAnimatingState, setIsAnimatingState] = useState(false);

  useEffect(() => {
    if (targetCoordinates) {
      // Zoom in tight for a specific school location
      const dist = zoomDistanceForExtent(5, worldScale) * cameraDistanceScale;
      const [cx, cy, cz] = latLonToCartesian(targetCoordinates.latitude, targetCoordinates.longitude, 1);
      const centroid = new Vector3(cx, cy, cz);

      targetPoint.current.copy(centroid);
      const dir = centroid.clone().normalize();
      targetPos.current.copy(dir.multiplyScalar(dist));
      isAnimating.current = true;
      setIsAnimatingState(true);
    } else if (targetIso3) {
      const geo = COUNTRY_GEO_MAP.get(targetIso3);
      if (geo) {
        const dist = zoomDistanceForExtent(geo.angularExtent, worldScale) * cameraDistanceScale;
        const [cx, cy, cz] = latLonToCartesian(geo.centroidLat, geo.centroidLon, 1);
        const centroid = new Vector3(cx, cy, cz);

        // Focus the camera on the country centroid (not the globe origin)
        targetPoint.current.copy(centroid);
        const dir = centroid.clone().normalize();
        targetPos.current.copy(dir.multiplyScalar(dist));
        isAnimating.current = true;
        setIsAnimatingState(true);
      }
    } else {
      // Zoom back out — reset to the default world view camera position
      targetPoint.current.set(0, 0, 0);
      targetPos.current.set(0, 0, WORLD_DISTANCE * cameraDistanceScale);
      isAnimating.current = true;
      setIsAnimatingState(true);
    }
  }, [targetIso3, targetCoordinates, camera, worldScale, cameraDistanceScale]);

  useFrame((_, delta) => {
    if (!isAnimating.current) return;

    const alpha = 1 - Math.exp(-LERP_SPEED * delta);
    camera.position.lerp(targetPos.current, alpha);
    camera.lookAt(targetPoint.current);

    // Keep OrbitControls targeting the current focus point
    if (controlsRef.current) {
      controlsRef.current.target.copy(targetPoint.current);
      controlsRef.current.update();
    }

    if (camera.position.distanceTo(targetPos.current) < 0.01) {
      camera.position.copy(targetPos.current);
      camera.lookAt(targetPoint.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetPoint.current);
        controlsRef.current.update();
      }
      isAnimating.current = false;
      setIsAnimatingState(false);
    }
  });

  // Keying the controls ensures internal OrbitControls state resets when we change
  // from a focused country view back to the global auto-rotating view.
  return (
    <OrbitControls
      key={targetIso3 ?? (targetCoordinates ? 'school' : 'world')}
      ref={controlsRef}
      enablePan={false}
      enabled
      enableRotate={interactive}
      enableZoom={interactive}
      autoRotate={targetIso3 === null && targetCoordinates == null && !isAnimatingState}
      autoRotateSpeed={0.9}
      // Allow deep zoom into countries (controls enforce minDistance)
      minDistance={0.12}
      // Allow zooming out further for a good globe view
      maxDistance={6}
      rotateSpeed={0.42}
      minPolarAngle={Math.PI * 0.1}
      maxPolarAngle={Math.PI * 0.9}
    />
  );
}

/* ── static world (no manual rotation) ── */

function StaticWorld({
  records,
  hoveredIso3,
  onMetricHover,
  onCountryClick,
  scale = 1,
  overlayStyle = 'academic',
  interactive = true,
}: {
  records: EducationCountryMetric[];
  hoveredIso3: string | null;
  onMetricHover: (record: EducationCountryMetric | null) => void;
  onCountryClick?: (record: EducationCountryMetric) => void;
  scale?: number;
  overlayStyle?: 'academic' | 'white';
  interactive?: boolean;
}) {
  return (
    <group scale={scale}>
      <EarthMesh />
      <CountryOutlines
        records={records}
        colorMode={overlayStyle === 'white' ? 'white' : 'heat'}
        opacity={overlayStyle === 'white' ? 0.82 : 0.78}
        strokeColor="#f5f7fb"
      />
      <CountryShapeExtrusions
        records={records}
        selectedIso3={hoveredIso3}
        onCountryHover={onMetricHover}
        onCountryClick={onCountryClick}
        colorMode={overlayStyle === 'white' ? 'white' : 'heat'}
        fillColor="#f4f6fb"
        enableInteraction={interactive && overlayStyle !== 'white'}
      />
    </group>
  );
}

/* ── main scene ── */

export function GlobeScene({
  className,
  onCountrySelect,
  selectedIso3 = null,
  targetCoordinates = null,
  overlayStyle = 'academic',
  interactive = true,
  showStars = true,
  transparentBackground = false,
  cameraDistanceScale = 1,
}: GlobeSceneProps) {
  const worldScale = 0.84;
  const [hoveredIso3, setHoveredIso3] = useState<string | null>(null);
  const typedDataset = educationDataset as EducationCountryDataset;

  const records = useMemo(
    () => (overlayStyle === 'white' ? [] : typedDataset.records),
    [overlayStyle, typedDataset.records]
  );

  const handleCountryClick = useCallback(
    (record: EducationCountryMetric) => {
      onCountrySelect?.(record);
    },
    [onCountrySelect]
  );

  return (
    <div
      className={cn(
        'relative min-h-[520px] overflow-hidden rounded-xl border border-white/10',
        transparentBackground ? 'bg-transparent' : 'bg-black',
        className
      )}
    >
      <Canvas
        camera={{ position: [0, 0, WORLD_DISTANCE * cameraDistanceScale], fov: 40 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          if (transparentBackground) {
            gl.setClearColor(0x000000, 0);
          }
        }}
      >
        {!transparentBackground && <color attach="background" args={['#010101']} />}
        {!transparentBackground && <fog attach="fog" args={['#010101', 2.8, 6.5]} />}
        <Suspense fallback={null}>
          <GlobeLights />
          {showStars && <Stars radius={120} depth={60} count={1100} factor={2.2} saturation={0} fade speed={0.12} />}
          <CameraController 
            targetIso3={selectedIso3} 
            targetCoordinates={targetCoordinates}
            worldScale={worldScale}
            interactive={interactive}
            cameraDistanceScale={cameraDistanceScale}
          />
          <StaticWorld
            records={records}
            hoveredIso3={hoveredIso3 ?? selectedIso3}
            onMetricHover={(record) => setHoveredIso3(record?.iso3 ?? null)}
            onCountryClick={handleCountryClick}
            scale={worldScale}
            overlayStyle={overlayStyle}
            interactive={interactive}
          />
        </Suspense>
      </Canvas>

      {!transparentBackground && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(0,0,0,0.58)_100%)]" />
      )}
    </div>
  );
}
