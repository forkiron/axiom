'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface BcSchoolRecord {
  id: string;
  schoolName: string;
  city: string;
  province?: string;
  rank: number | null;
  rating: number | null;
  latitude: number;
  longitude: number;
}

interface SchoolAdjustment {
  adjustmentFactor: number;
  estimatedDifficulty?: number;
  mAdj?: number;
  isDefault?: boolean;
}

interface SchoolDetailsPanelProps {
  school: BcSchoolRecord | null;
  onClose: () => void;
  getRatingColor?: (rating: number | null | undefined) => string;
  adjustment?: SchoolAdjustment;
  adjustmentCount?: number;
}

export function SchoolDetailsPanel({ school, onClose: _onClose, getRatingColor, adjustment, adjustmentCount }: SchoolDetailsPanelProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const af = adjustment?.adjustmentFactor;
  const isInflated = af != null && af < 0;
  const isDeflated = af != null && af > 0;

  const handleReset = async () => {
    if (!school?.id) return;
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await fetch('/api/school-adjustment/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: school.id })
      });
      if (!res.ok) throw new Error('Failed to reset');
      
      // Dispatch an event to WorldGlobeMap to reload adjustments
      window.dispatchEvent(new Event('school-adjustments-updated'));
    } catch (e: any) {
      setResetError(e.message ?? 'Error resetting data');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AnimatePresence>
      {school && (
        <motion.div
          initial={{ opacity: 0, x: -50, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -50, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute left-4 top-20 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-white/20 bg-black/55 p-4 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        >
          <div>
            <h2 className="mb-1 font-sans text-3xl font-semibold leading-tight tracking-[-0.02em] text-zinc-100">
              {school.schoolName}
            </h2>
            <p className="mb-5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {school.city}, {school.province ?? "British Columbia"}
            </p>

            {/* Base metrics row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/35 bg-white/10 p-3 backdrop-blur-2xl">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Overall Rating
                </div>
                <div
                  className="text-3xl font-extrabold"
                  style={{ color: getRatingColor ? getRatingColor(school.rating) : '#10b981' }}
                >
                  {school.rating != null ? school.rating.toFixed(1) : 'N/A'}
                  {school.rating != null && <span className="ml-1 text-base font-medium text-zinc-500">/10</span>}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border border-white/35 bg-white/10 p-3 backdrop-blur-2xl">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Provincial Rank
                </div>
                <div className="text-3xl font-extrabold text-zinc-100">
                  {school.rank != null ? `#${school.rank}` : 'N/A'}
                </div>
              </div>
            </div>

            {/* AI analysis section — always show with defaults if not yet analyzed */}
            {adjustment != null && (
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    {adjustment.isDefault ? 'Estimated (Default)' : 'AI Analysis'}
                  </span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Test Difficulty */}
                  <div className="flex flex-col items-center justify-center rounded-xl border border-white/35 bg-white/10 p-2.5 backdrop-blur-2xl">
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Difficulty</span>
                    <span className="text-xl font-bold text-zinc-100">
                      {adjustment.estimatedDifficulty != null
                        ? adjustment.estimatedDifficulty.toFixed(1)
                        : '5.0'}
                    </span>
                    <span className="text-[10px] text-zinc-500">/10</span>
                  </div>

                  {/* Adjustment Factor */}
                  <div className={`rounded-xl border p-2.5 flex flex-col items-center justify-center ${
                    isDeflated ? 'border-emerald-300/45 bg-white/10 backdrop-blur-2xl' :
                    isInflated ? 'border-rose-300/45 bg-white/10 backdrop-blur-2xl' :
                    'border-white/35 bg-white/10 backdrop-blur-2xl'
                  }`}>
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Adjustment</span>
                    <span className={`text-xl font-bold ${isDeflated ? 'text-emerald-300' : isInflated ? 'text-rose-300' : 'text-zinc-300'}`}>
                      {af != null ? `${af > 0 ? '+' : ''}${af.toFixed(1)}` : '0.0'}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">pts</span>
                  </div>
                </div>

                {!adjustment.isDefault && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-[11px] uppercase tracking-[0.08em] ${
                      isDeflated ? 'border-emerald-300/35 bg-white/10 text-emerald-200 backdrop-blur-xl'
                      : isInflated ? 'border-rose-300/35 bg-white/10 text-rose-200 backdrop-blur-xl'
                      : 'border-white/35 bg-white/10 text-zinc-300 backdrop-blur-xl'
                    }`}
                  >
                    {isDeflated ? '↑ Grade Deflation — school grades harder than average'
                    : isInflated ? '↓ Grade Inflation — school grades easier than average'
                    : 'Standard grading detected'}
                  </div>
                )}
                {adjustmentCount != null && adjustmentCount > 0 && (
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                    <div className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">
                      Based on {adjustmentCount} {adjustmentCount === 1 ? 'analysis' : 'analyses'}
                    </div>
                    <div className="flex flex-col items-end">
                      <button
                        onClick={handleReset}
                        disabled={isResetting}
                        className="text-xs text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50 underline decoration-rose-400/30 underline-offset-2"
                      >
                        {isResetting ? 'Resetting...' : 'Reset to default'}
                      </button>
                      {resetError && <span className="text-[10px] text-rose-500 mt-0.5">{resetError}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
