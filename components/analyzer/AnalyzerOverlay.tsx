'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TestAnalyzerForm } from '@/components/analyzer/TestAnalyzerForm';
import { TestAnalyzerResult } from '@/components/analyzer/TestAnalyzerResult';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
  curriculumAlignment?: string;
  questionStyle?: string;
  questionCount?: number;
}

export function AnalyzerOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 z-[90] -translate-y-1/2 rounded-l-xl border border-r-0 border-white/20 bg-slate-900/60 px-3 py-5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-100 shadow-xl shadow-black/45 backdrop-blur-xl transition hover:bg-slate-900/80"
        >
          Open Analyzer
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close analyzer overlay"
              onClick={() => setIsOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[2px]"
            />

            <motion.aside
              initial={{ x: 520, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 520, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="fixed inset-y-2 right-2 z-[80] w-[min(36rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-white/10 bg-[#05070de8] p-3 shadow-2xl backdrop-blur-xl sm:inset-y-4 sm:right-4 sm:w-[min(38rem,calc(100vw-2rem))] sm:p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">AXIOM ANALYZER</p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-100">AI Test Evaluator</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {!analysisResult ? (
                <TestAnalyzerForm onResult={setAnalysisResult} />
              ) : (
                <TestAnalyzerResult result={analysisResult} onReset={() => setAnalysisResult(null)} />
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
