'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { GlobeScene } from '../components/globe/GlobeScene';
import type { EducationCountryMetric } from '../lib/types';

export default function LandingPage() {
  const [selectedRecord, setSelectedRecord] = useState<EducationCountryMetric | null>(null);

  const handleCountrySelect = (record: EducationCountryMetric | null) => {
    setSelectedRecord(record);
  };

  const handleBackToGlobe = () => {
    setSelectedRecord(null);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="h-full w-full"
      >
        <GlobeScene
          className="h-screen min-h-screen w-screen rounded-none border-0"
          onCountrySelect={handleCountrySelect}
          selectedIso3={selectedRecord?.iso3 ?? null}
        />
      </motion.div>

      <div className="absolute top-6 right-6 z-10 flex gap-3">
        <Link
          href="/analyzer"
          className="rounded-md border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/60 transition-colors backdrop-blur-sm"
        >
          AI Test Analyzer →
        </Link>
        {selectedRecord && (
          <button
            type="button"
            onClick={handleBackToGlobe}
            className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          >
            ← Back to Globe
          </button>
        )}
      </div>

      {selectedRecord && (
        <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
          <span className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200">
            {selectedRecord.country}
          </span>
        </div>
      )}
    </main>
  );
}
