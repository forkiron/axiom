'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import bcSchoolDataset from '../../lib/data/bc-school-rankings.json';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
  curriculumAlignment?: string;
  questionStyle?: string;
  questionCount?: number;
}

interface School {
  id: string;
  schoolName: string;
  city: string;
  province: string;
}

const ALL_SCHOOLS: School[] = (bcSchoolDataset as any).schools as School[];

export function TestAnalyzerResult({ result, onReset }: { result: AnalysisResult, onReset: () => void }) {
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showDropdown, setShowDropdown] = useState(false);

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

  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return [];
    const q = schoolSearch.toLowerCase();
    return ALL_SCHOOLS.filter(s =>
      s.schoolName.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [schoolSearch]);

  const handleSelectSchool = (school: School) => {
    setSelectedSchool(school);
    setSchoolSearch(school.schoolName);
    setShowDropdown(false);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!selectedSchool) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/school-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: selectedSchool.id,
          adjustmentFactor: result.adjustmentFactor,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

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
          <p className="text-sm text-slate-400">AXIOM AI Evaluation</p>
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

      {(result.questionStyle || result.questionCount != null) && (
        <div className="flex flex-wrap items-center gap-2 relative z-10">
          {result.questionCount != null && (
            <>
              <span className="text-slate-500 text-xs uppercase tracking-wider">Questions</span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                {result.questionCount}
              </span>
            </>
          )}
          {result.questionStyle && (
            <>
              <span className="text-slate-500 text-xs uppercase tracking-wider">Detected Style</span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                {result.questionStyle}
              </span>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl bg-slate-950/50 border border-slate-800/50 p-4 relative z-10">
        <span className="text-slate-500 text-xs uppercase tracking-wider block mb-2">AI Rationale</span>
        <p className="text-slate-300 text-sm leading-relaxed">
          {result.rationale}
        </p>
      </div>

      {result.curriculumAlignment && (
        <div className="rounded-xl bg-slate-950/50 border border-slate-800/50 p-4 relative z-10">
          <span className="text-slate-500 text-xs uppercase tracking-wider block mb-2">Curriculum Alignment</span>
          <p className="text-slate-300 text-sm leading-relaxed">
            {result.curriculumAlignment}
          </p>
        </div>
      )}

      {/* Apply to School */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 relative z-10 space-y-3">
        <div>
          <span className="text-slate-300 text-sm font-medium block mb-0.5">Apply to School</span>
          <span className="text-slate-500 text-xs">
            Save this adjustment factor ({result.adjustmentFactor > 0 ? '+' : ''}{result.adjustmentFactor.toFixed(1)}%) to a school's profile on the map
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={schoolSearch}
            onChange={e => { setSchoolSearch(e.target.value); setShowDropdown(true); setSelectedSchool(null); setSaveStatus('idle'); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search school name or city..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
          {showDropdown && filteredSchools.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-48 overflow-y-auto">
              {filteredSchools.map(school => (
                <li
                  key={school.id}
                  onClick={() => handleSelectSchool(school)}
                  className="flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-800 transition-colors"
                >
                  <span className="text-slate-200 font-medium">{school.schoolName}</span>
                  <span className="text-slate-500 text-xs ml-2">{school.city}, {school.province}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!selectedSchool || saveStatus === 'saving' || saveStatus === 'saved'}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            saveStatus === 'saved'
              ? 'bg-emerald-900/50 border border-emerald-700/50 text-emerald-400 cursor-default'
              : saveStatus === 'error'
              ? 'bg-rose-900/30 border border-rose-700/50 text-rose-400'
              : !selectedSchool
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {saveStatus === 'saving' && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {saveStatus === 'saved' ? `✓ Saved to ${selectedSchool?.schoolName}` :
           saveStatus === 'error' ? 'Error saving — try again' :
           saveStatus === 'saving' ? 'Saving...' :
           selectedSchool ? `Save to ${selectedSchool.schoolName}` : 'Select a school first'}
        </button>
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
