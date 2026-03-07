'use client';

import { motion } from 'framer-motion';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
}

export function TestAnalyzerResult({ result, onReset }: { result: AnalysisResult, onReset: () => void }) {
  
  // Decide colors based on inflation vs deflation
  const isInflated = result.adjustmentFactor < 0;
  const isDeflated = result.adjustmentFactor > 0;
  
  let statusColor = 'text-amber-400';
  let statusBg = 'bg-amber-400/10 border-amber-400/20';
  let statusLabel = 'Standard Average';

  if (isInflated) {
    statusColor = 'text-rose-400';
    statusBg = 'bg-rose-500/10 border-rose-500/20';
    statusLabel = 'Grade Inflation Detected';
  } else if (isDeflated) {
    statusColor = 'text-emerald-400';
    statusBg = 'bg-emerald-500/10 border-emerald-500/20';
    statusLabel = 'Standardized Deflation';
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative overflow-hidden"
    >
      {/* Decorative background glow */}
      <div className={`absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full blur-[80px] opacity-20 ${
        isInflated ? 'bg-rose-500' : isDeflated ? 'bg-emerald-500' : 'bg-amber-500'
      }`} />

      <div className="flex justify-between items-start relative z-10">
        <div>
          <h3 className="text-xl font-medium text-slate-100 mb-1">Analysis Complete</h3>
          <p className="text-sm text-slate-400">CanStandard AI Evaluation</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium border ${statusBg} ${statusColor}`}>
          {statusLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10 py-4">
        <div className="flex flex-col border-l-2 border-slate-800 pl-4">
          <span className="text-slate-500 text-xs uppercase tracking-wider mb-1">Inherent Difficulty</span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-slate-200">{result.estimatedDifficulty.toFixed(1)}</span>
            <span className="text-slate-500 text-sm">/ 10</span>
          </div>
        </div>
        
        <div className="flex flex-col border-l-2 border-slate-800 pl-4">
          <span className="text-slate-500 text-xs uppercase tracking-wider mb-1">Adjustment Factor</span>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${statusColor}`}>
              {result.adjustmentFactor > 0 ? '+' : ''}{result.adjustmentFactor.toFixed(1)}
            </span>
            <span className="text-slate-500 text-sm">%</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-950/50 border border-slate-800/50 p-4 relative z-10">
        <span className="text-slate-500 text-xs uppercase tracking-wider block mb-2">AI Rationale</span>
        <p className="text-slate-300 text-sm leading-relaxed">
          {result.rationale}
        </p>
      </div>

      <button
        onClick={onReset}
        className="w-full text-center py-3 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        Analyze Another Test
      </button>

    </motion.div>
  );
}
