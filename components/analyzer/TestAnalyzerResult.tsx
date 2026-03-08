'use client';

import { motion } from 'framer-motion';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  classAverage?: number;
  province?: string;
  selectedAgent?: string;
  agentLabel?: string;
  autoApplied?: boolean;
  autoAppliedSchoolId?: string;
  autoAppliedSchoolName?: string;
  autoAppliedMAdj?: number;
  autoAppliedError?: string;
}

export function TestAnalyzerResult({ result, onReset }: { result: AnalysisResult, onReset: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-cyan-500 blur-[80px] opacity-15" />

      <div className="relative z-10">
        <h3 className="mb-1 text-xl font-medium text-slate-100">Analysis Complete</h3>
        <p className="text-sm text-slate-400">AXIOM AI Evaluation</p>
        {result.agentLabel && (
          <p className="mt-1 text-xs text-cyan-300/90">Routed via {result.agentLabel}</p>
        )}
      </div>

      <div className="relative z-10 rounded-xl border border-slate-800 bg-slate-950/50 p-5">
        <span className="mb-2 block text-xs uppercase tracking-wider text-slate-500">Inherent Difficulty</span>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-slate-100">{result.estimatedDifficulty.toFixed(1)}</span>
          <span className="text-slate-500 text-sm">/ 10</span>
        </div>
      </div>

      {result.autoApplied === true && (
        <div className="relative z-10 space-y-1 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-4 py-3 text-xs text-emerald-300">
          <p className="font-semibold text-emerald-200">
            Auto-saved to {result.autoAppliedSchoolName ?? 'selected school'} ✓
          </p>
          <p>
            Updated difficulty:{' '}
            <span className="font-mono font-bold text-emerald-200">{result.estimatedDifficulty.toFixed(1)}/10</span>
          </p>
        </div>
      )}

      {result.autoApplied === false && result.autoAppliedError && (
        <div className="relative z-10 rounded-xl border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-xs text-rose-300">
          Auto-save failed: {result.autoAppliedError}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full py-3 text-center text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
      >
        Analyze Another Test
      </button>
    </motion.div>
  );
}
