'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ANALYZER_SCHOOL_OPTIONS, type AnalyzerSchoolOption } from '@/lib/all-schools';

export function GpaCalculatorForm() {
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<AnalyzerSchoolOption | null>(null);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [currentAverage, setCurrentAverage] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    originalMark: number;
    adjustmentFactor: number;
    adjustedMark: number;
  } | null>(null);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    if (!q) {
      return ANALYZER_SCHOOL_OPTIONS.slice(0, 10);
    }
    return ANALYZER_SCHOOL_OPTIONS.filter((school) => {
      return (
        school.schoolName.toLowerCase().includes(q) ||
        school.city.toLowerCase().includes(q) ||
        school.province.toLowerCase().includes(q)
      );
    }).slice(0, 10);
  }, [schoolSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) {
      setError('Please select a school first.');
      return;
    }
    
    const numericMark = parseFloat(currentAverage);
    if (isNaN(numericMark) || numericMark < 0 || numericMark > 100) {
      setError('Please enter a valid average between 0 and 100.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const qs = new URLSearchParams({
        schoolId: selectedSchool.id,
        mark: currentAverage
      });
      const response = await fetch('/api/calculate-gpa?' + qs.toString());
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to calculate GPA');
      }

      setResult({
        originalMark: data.originalMark,
        adjustmentFactor: data.adjustmentFactor,
        adjustedMark: data.adjustedMark
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-xl"
    >
      <div className="space-y-3">
        <h3 className="mb-1 text-xl font-medium uppercase tracking-[0.12em] text-zinc-100">ADJUSTED GPA CALCULATOR</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-300">Your School (Search + Select)</label>
          <div className="relative">
            <input
              type="text"
              value={schoolSearch}
              onChange={(e) => {
                setSchoolSearch(e.target.value);
                setSelectedSchool(null);
                setShowSchoolDropdown(true);
                setResult(null);
              }}
              onFocus={() => setShowSchoolDropdown(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSchoolDropdown(false), 120);
              }}
              placeholder="Type school name, city, or province..."
              className="w-full rounded-lg border border-white/15 bg-black/45 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all focus:border-white/40 focus:ring-1 focus:ring-white/30"
            />
            {showSchoolDropdown && filteredSchools.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/15 bg-black/80 shadow-xl backdrop-blur-xl">
                {filteredSchools.map((school) => (
                  <li
                    key={school.id}
                    onMouseDown={() => {
                      setSelectedSchool(school);
                      setSchoolSearch(school.schoolName);
                      setShowSchoolDropdown(false);
                      setResult(null);
                    }}
                    className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/10"
                  >
                    <span className="font-medium text-zinc-100">{school.schoolName}</span>
                    <span className="ml-2 flex-shrink-0 text-xs text-zinc-400">{school.city}, {school.province}</span>
                  </li>
                ))}
              </ul>
            )}
            {showSchoolDropdown && schoolSearch.trim().length > 0 && filteredSchools.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/15 bg-black/80 px-4 py-3 text-sm text-zinc-400 shadow-xl backdrop-blur-xl">
                No schools found.
              </div>
            )}
          </div>
          {selectedSchool && (
            <p className="text-xs text-zinc-300">
              Selected: {selectedSchool.schoolName} ({selectedSchool.city}, {selectedSchool.province})
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-300">Current Average (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={currentAverage}
            onChange={(e) => {
              setCurrentAverage(e.target.value);
              setResult(null);
            }}
            placeholder="e.g. 85.5"
            className="w-full rounded-lg border border-white/15 bg-black/45 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all focus:border-white/40 focus:ring-1 focus:ring-white/30"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedSchool || !currentAverage}
          className="w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-colors hover:bg-zinc-200 disabled:opacity-50 mt-2"
        >
          {loading ? 'Calculating...' : 'Calculate Adjusted GPA'}
        </button>

        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 rounded-xl border border-white/20 bg-white/5 p-4"
          >
            <div className="flex flex-col items-center justify-center text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-2">Estimated Adjusted Average</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-white">{result.adjustedMark.toFixed(1)}</span>
                <span className="text-lg text-zinc-500">%</span>
              </div>
              <div className="mt-4 flex w-full items-center justify-between border-t border-white/10 pt-3 text-sm">
                <div className="flex flex-col items-start">
                  <span className="text-zinc-500 text-xs uppercase tracking-wider">Original</span>
                  <span className="text-zinc-200 font-medium">{result.originalMark.toFixed(1)}%</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-zinc-500 text-xs uppercase tracking-wider">School Adjustment</span>
                  <span className={`font-medium ${result.adjustmentFactor > 0 ? 'text-emerald-400' : result.adjustmentFactor < 0 ? 'text-rose-400' : 'text-zinc-200'}`}>
                    {result.adjustmentFactor > 0 ? '+' : ''}{result.adjustmentFactor.toFixed(2)} pts
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.form>
  );
}
