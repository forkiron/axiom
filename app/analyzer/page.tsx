'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { RouteTransitionOverlay } from '../../components/transitions/RouteTransitionOverlay';
import { TestAnalyzerForm } from '../../components/analyzer/TestAnalyzerForm';
import { TestAnalyzerResult } from '../../components/analyzer/TestAnalyzerResult';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  classAverage?: number;
  province?: string;
  selectedAgent?: string;
  agentLabel?: string;
}

export default function AnalyzerPage() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  return (
    <AppShell
      title="AI Test Evaluator"
      subtitle="Difficulty routing by specialist agents"
    >
      <RouteTransitionOverlay />

      <section className="mx-auto max-w-3xl pt-8">
        <div className="mb-10 text-center">
          <h2 className="mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-3xl font-bold text-transparent">
            Measure Inherent Difficulty
          </h2>
          <p className="mx-auto max-w-2xl leading-relaxed text-slate-400">
            Submit a test or assignment. AXIOM routes it to the best analyzer agent and estimates the inherent difficulty.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-[3rem] bg-gradient-to-b from-emerald-900/20 to-transparent blur-3xl" />

          {!analysisResult ? (
            <TestAnalyzerForm onResult={setAnalysisResult} />
          ) : (
            <TestAnalyzerResult
              result={analysisResult}
              onReset={() => setAnalysisResult(null)}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
