"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function BackboardQuestionBox() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const placeholder = useMemo(
    () =>
      "Ask a question about the school rankings, the map, or the data (e.g., 'Which Vancouver schools have rating 10?')",
    []
  );

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  const submit = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/backboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? "Unknown error");
      } else {
        setAnswer(json?.answer ?? "(no answer)");
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(95vw,720px)] -translate-x-1/2">
      <div className="flex justify-end">
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-indigo-500"
          aria-expanded={open}
          aria-label="Toggle Backboard question box"
        >
          {open ? "Close AI assistant" : "Ask the AI"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/80 p-4 shadow-xl shadow-black/30 backdrop-blur">
          <label className="mb-2 block text-sm font-semibold text-slate-200">
            Ask a question:
          </label>
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
              placeholder={placeholder}
            />
            <button
              onClick={submit}
              disabled={!question.trim() || loading}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Thinking…" : "Ask"}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-rose-950/70 px-3 py-2 text-sm text-rose-200">
              Error: {error}
            </div>
          )}

          {answer && (
            <div className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-100">
              {answer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
