'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
}

export function TestAnalyzerForm({ onResult }: { onResult: (res: AnalysisResult) => void }) {
  const [subject, setSubject] = useState('math');
  const [classAverage, setClassAverage] = useState('85');
  const [testContent, setTestContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testContent.trim()) {
      setError('Please paste the test content before analyzing.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/analyze-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          classAverage: parseFloat(classAverage),
          testContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed. Make sure your API key is set.');
      }

      onResult(data.result as AnalysisResult);
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
      className="space-y-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-6 backdrop-blur-md"
    >
      <div className="space-y-4">
        <h3 className="text-xl font-medium text-slate-100 mb-2">Evaluate Test Difficulty</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Subject</label>
            <select 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            >
              <option value="math">Mathematics</option>
              <option value="physics">Physics</option>
              <option value="english">English Literature</option>
              <option value="chemistry">Chemistry</option>
              <option value="biology">Biology</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Class Average (%)</label>
            <div className="relative">
              <input 
                type="number" 
                value={classAverage}
                onChange={(e) => setClassAverage(e.target.value)}
                min="0" max="100" step="0.1" required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">%</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium flex justify-between text-slate-300">
            <span>Test Content</span>
            <span className="text-xs text-slate-500 font-normal">Paste text from PDF/Doc</span>
          </label>
          <textarea 
            value={testContent}
            onChange={(e) => setTestContent(e.target.value)}
            placeholder="E.g., 1. Calculate the derivative of f(x) = x^2 * sin(x)..."
            className="h-48 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-900/50 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Analyzing Test Difficulty...
          </span>
        ) : (
          'Analyze Standards Adjustment'
        )}
      </button>
    </motion.form>
  );
}
