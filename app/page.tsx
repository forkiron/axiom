'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { WorldGlobeMap } from '../components/globe/WorldGlobeMap';

export default function LandingPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="h-full w-full"
      >
        <WorldGlobeMap className="h-screen min-h-screen w-screen" />
        <div className="pointer-events-none absolute bottom-8 right-16 z-20 flex gap-3">
          <div className="pointer-events-auto shadow-lg">
            <Link
              href="/analyzer"
              className="rounded-md border border-emerald-500/30 bg-emerald-950/80 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-900/90 transition-colors backdrop-blur-md"
            >
              AI Test Analyzer →
            </Link>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
