'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ANALYZER_SCHOOL_OPTIONS, type AnalyzerSchoolOption } from '@/lib/all-schools';

interface AnalysisResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
  curriculumAlignment?: string;
  questionStyle?: string;
  questionCount?: number;
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

const DEFAULT_CLASS_AVERAGE = 75;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix: "data:application/pdf;base64,"
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function TestAnalyzerForm({ onResult }: { onResult: (res: AnalysisResult) => void }) {
  const [province, setProvince] = useState('BC');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<AnalyzerSchoolOption | null>(null);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [testContent, setTestContent] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [threadId, setThreadId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existingSession = window.localStorage.getItem('axiom_analyzer_session_id');
    const existingThread = window.localStorage.getItem('axiom_analyzer_thread_id');
    const resolvedSession =
      existingSession ??
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `analyzer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    window.localStorage.setItem('axiom_analyzer_session_id', resolvedSession);
    setSessionId(resolvedSession);
    if (existingThread) setThreadId(existingThread);
  }, []);

  useEffect(() => {
    if (!pdfFile) {
      setPdfPreviewUrl('');
      setShowPdfPreview(false);
      return;
    }

    const objectUrl = URL.createObjectURL(pdfFile);
    setPdfPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pdfFile]);

  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();

    if (!q) {
      return ANALYZER_SCHOOL_OPTIONS.filter((school) => school.province === province).slice(0, 10);
    }

    return ANALYZER_SCHOOL_OPTIONS.filter((school) => {
      return (
        school.schoolName.toLowerCase().includes(q) ||
        school.city.toLowerCase().includes(q) ||
        school.province.toLowerCase().includes(q)
      );
    }).slice(0, 10);
  }, [province, schoolSearch]);

  const handleFile = useCallback((file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setPdfFile(file);
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testContent.trim() && !pdfFile) {
      setError('Please paste test content or upload a PDF before analyzing.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let pdfData: string | undefined;
      if (pdfFile) {
        pdfData = await fileToBase64(pdfFile);
      }

      const response = await fetch('/api/analyze-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'general',
          province,
          classAverage: DEFAULT_CLASS_AVERAGE,
          school: selectedSchool
            ? {
                id: selectedSchool.id,
                name: selectedSchool.schoolName,
                city: selectedSchool.city,
                province: selectedSchool.province,
              }
            : schoolSearch.trim() || undefined,
          testContent: testContent.trim() || undefined,
          pdfData,
          sessionId: sessionId || undefined,
          threadId: threadId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed. Make sure your API key is set.');
      }

      if (typeof data.threadId === 'string' && data.threadId.length > 0) {
        setThreadId(data.threadId);
        window.localStorage.setItem('axiom_analyzer_thread_id', data.threadId);
      }

      const resultPayload: AnalysisResult = {
        ...(data.result as AnalysisResult),
        classAverage: DEFAULT_CLASS_AVERAGE,
        province,
      };

      if (selectedSchool) {
        try {
          const saveResponse = await fetch('/api/school-adjustment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schoolId: selectedSchool.id,
              estimatedDifficulty: resultPayload.estimatedDifficulty,
              classAverage: DEFAULT_CLASS_AVERAGE,
              province: selectedSchool.province,
            }),
          });

          if (saveResponse.ok) {
            const saveJson = await saveResponse.json();
            resultPayload.autoApplied = true;
            resultPayload.autoAppliedSchoolId = selectedSchool.id;
            resultPayload.autoAppliedSchoolName = selectedSchool.schoolName;
            resultPayload.autoAppliedMAdj =
              typeof saveJson?.mAdj === 'number' ? saveJson.mAdj : undefined;
            window.dispatchEvent(new CustomEvent('school-adjustments-updated'));
          } else {
            const saveJson = await saveResponse.json().catch(() => ({}));
            resultPayload.autoApplied = false;
            resultPayload.autoAppliedError = String(saveJson?.error ?? 'Failed to auto-apply adjustment');
          }
        } catch (saveError: any) {
          resultPayload.autoApplied = false;
          resultPayload.autoAppliedError = saveError?.message ?? 'Failed to auto-apply adjustment';
        }
      }

      onResult(resultPayload);
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
        <h3 className="mb-1 text-xl font-medium uppercase tracking-[0.12em] text-zinc-100">EVALUATE TEST DIFFICULTY</h3>

        <div className="space-y-2">
          <label className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-300">School</label>
          <div className="relative">
            <input
              type="text"
              value={schoolSearch}
              onChange={(e) => {
                setSchoolSearch(e.target.value);
                setSelectedSchool(null);
                setShowSchoolDropdown(true);
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
                      setProvince(school.province);
                      setShowSchoolDropdown(false);
                    }}
                    className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/10"
                  >
                    <span className="font-medium text-zinc-100">{school.schoolName}</span>
                    <span className="ml-2 text-xs text-zinc-400">{school.city}, {school.province}</span>
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



        <div className="space-y-2 pt-1">
          <label className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-300">Upload Test PDF</label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-all ${
              isDragOver
                ? 'border-white/45 bg-white/10'
                : pdfFile
                ? 'border-white/35 bg-white/10'
                : 'border-white/20 bg-black/35 hover:border-white/35'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {pdfFile ? (
              <>
                <svg className="h-6 w-6 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-zinc-100">{pdfFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPdfPreview(true);
                  }}
                  className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPdfFile(null); }}
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-zinc-400">
                  <span className="font-medium text-zinc-200">Click or drag</span> a PDF here
                </p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium uppercase tracking-[0.12em] text-zinc-300">Additional Notes</label>
          <textarea
            value={testContent}
            onChange={(e) => setTestContent(e.target.value)}
            placeholder="E.g., 1. Calculate the derivative of f(x) = x^2 * sin(x)..."
            className="h-24 w-full resize-none rounded-lg border border-white/15 bg-black/45 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all focus:border-white/40 focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-white/20 bg-black/40 p-3 text-sm text-zinc-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-lg border border-white/20 bg-black/55 px-4 py-3 text-sm font-medium uppercase tracking-[0.12em] text-zinc-100 transition-colors hover:bg-black/75 disabled:border-white/10 disabled:bg-black/30 disabled:text-zinc-500"
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

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-3">
          <div className="flex h-[90vh] w-[min(70rem,96vw)] flex-col overflow-hidden rounded-xl border border-white/20 bg-black/55 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="truncate text-sm font-medium text-zinc-100">
                {pdfFile?.name ?? 'PDF Preview'}
              </p>
              <button
                type="button"
                onClick={() => setShowPdfPreview(false)}
                className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <iframe
              title="Uploaded PDF preview"
              src={pdfPreviewUrl}
              className="h-full w-full bg-black/70"
            />
          </div>
        </div>
      )}
    </motion.form>
  );
}
