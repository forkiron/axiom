'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { RouteTransitionOverlay } from '../../components/transitions/RouteTransitionOverlay';
import { TestAnalyzerForm } from '../../components/analyzer/TestAnalyzerForm';
import { TestAnalyzerResult } from '../../components/analyzer/TestAnalyzerResult';

export default function AnalyzerPage() {
  const [analysisResult, setAnalysisResult] = useState<{
    estimatedDifficulty: number;
    adjustmentFactor: number;
    rationale: string;
  } | null>(null);

  return (
    <AppShell
      title="AI Test Evaluator"
      subtitle="Standardize difficulty across curricula"
    >
      <RouteTransitionOverlay />
      
      <section className="mx-auto max-w-3xl pt-8">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-4">
            Measure True Academic Rigor
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Paste a test or assignment below. Our AI model evaluates the inherent difficulty of the material against national standards. By comparing this to the class average, AXIOM generates a definitive Adjustment Factor to expose grade inflation or reward rigorous grading.
          </p>
        </div>

        <div className="relative">
          {/* Decorative glow behind the active component */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-900/20 to-transparent blur-3xl rounded-[3rem]" />
          
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
