'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SchoolAgentContext } from '@/lib/school-agent';
import { useSchoolTourStore } from '@/stores/useSchoolTourStore';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'error';
  text: string;
  meta?: {
    totalMatched?: number;
    intent?: string;
    mode?: string;
    toolTrace?: string[];
  };
}

interface SchoolAgentResponse {
  success?: boolean;
  mode?: 'school-agent' | 'backboard' | 'backboard-tools';
  answer?: string;
  error?: string;
  context?: SchoolAgentContext; // kept for backwards compatibility with local mode
  meta?: {
    totalMatched?: number;
    intent?: string;
  };
  threadId?: string;
  toolTrace?: string[];
  recommendedSchoolIds?: string[];
}

const QUICK_PROMPTS = [
  'Top 5 schools in Vancouver',
  'How many schools in Calgary have rating at least 8?',
  'Best schools in Montreal with rating 9 or above',
];

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function BackboardQuestionBox() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<SchoolAgentContext | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: messageId(),
      role: 'assistant',
      text: 'School agent ready. Backboard tool orchestration + memory are enabled when configured.',
    },
  ]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const addSchoolsToTour = useSchoolTourStore((state) => state.addSchools);
  const clearTour = useSchoolTourStore((state) => state.clearTour);

  const placeholder = useMemo(
    () => 'Ask about schools (example: "best schools in Vancouver with rating 9+")',
    []
  );

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const existingSession = window.localStorage.getItem('axiom_school_agent_session_id');
    const existingThread = window.localStorage.getItem('axiom_school_agent_thread_id');
    const resolvedSession =
      existingSession ??
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    window.localStorage.setItem('axiom_school_agent_session_id', resolvedSession);
    setSessionId(resolvedSession);
    if (existingThread) setThreadId(existingThread);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  const sendQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: messageId(),
        role: 'user',
        text: trimmed,
      },
    ]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/backboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          mode: 'auto',
          sessionId: sessionId || undefined,
          threadId: threadId || undefined,
          context,
        }),
      });

      const json = (await res.json()) as SchoolAgentResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Unknown server error');
      }

      if (json.context) {
        setContext(json.context);
      }
      if (typeof json.threadId === 'string' && json.threadId.length > 0) {
        setThreadId(json.threadId);
        window.localStorage.setItem('axiom_school_agent_thread_id', json.threadId);
      }
      if (Array.isArray(json.recommendedSchoolIds) && json.recommendedSchoolIds.length > 0) {
        addSchoolsToTour(json.recommendedSchoolIds, 'chat-agent');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: 'assistant',
          text: json.answer ?? '(no answer)',
          meta: {
            totalMatched: json.meta?.totalMatched,
            intent: json.meta?.intent,
            mode: json.mode,
            toolTrace: Array.isArray(json.toolTrace) ? json.toolTrace : [],
          },
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: messageId(),
          role: 'error',
          text: error?.message ?? 'Network error',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = () => {
    setContext(null);
    setThreadId('');
    clearTour();
    window.localStorage.removeItem('axiom_school_agent_thread_id');
    setMessages([
      {
        id: messageId(),
        role: 'assistant',
        text: 'Thread cleared. A new Backboard thread will be created on your next message.',
      },
    ]);
  };

  if (pathname === '/') {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(95vw,760px)] -translate-x-1/2">
      <div className="flex items-center justify-center gap-2">
        {open && (
          <button
            type="button"
            onClick={resetConversation}
            className="rounded-full border border-white/20 bg-black/65 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-black/85"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-100 shadow-xl shadow-black/45 backdrop-blur-xl transition hover:bg-slate-900/80"
          aria-expanded={open}
          aria-label="Toggle school agent"
        >
          {open ? 'Close school agent' : 'Ask the school agent'}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-white/15 bg-[#06090f]/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
          <div ref={listRef} className="max-h-[46vh] space-y-3 overflow-y-auto px-1 py-1">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                <div
                  className={[
                    'inline-block max-w-[95%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'bg-white text-black'
                      : message.role === 'error'
                        ? 'bg-rose-950/70 text-rose-200'
                        : 'bg-white/10 text-slate-100',
                  ].join(' ')}
                >
                  {message.text}
                </div>
                {message.role === 'assistant' && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {message.meta?.mode ? `mode: ${message.meta.mode}` : 'mode: n/a'}
                    {message.meta?.intent ? ` • intent: ${message.meta.intent}` : ''}
                    {message.meta?.totalMatched !== undefined ? ` • matched: ${message.meta.totalMatched}` : ''}
                    {message.meta?.toolTrace && message.meta.toolTrace.length > 0
                      ? ` • tools: ${message.meta.toolTrace.join(', ')}`
                      : ''}
                  </p>
                )}
              </div>
            ))}
            {loading && <p className="text-sm text-slate-400">Running school query...</p>}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={loading}
                onClick={() => sendQuestion(prompt)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion(question);
                }
              }}
              rows={2}
              className="flex-1 resize-none rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-slate-300/60 focus:ring-2 focus:ring-slate-200/20"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => sendQuestion(question)}
              disabled={!question.trim() || loading}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
