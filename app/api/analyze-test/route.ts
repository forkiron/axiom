import { NextResponse } from 'next/server';
import {
  type AnalyzerInput,
  type AnalyzerInspection,
  type AnalyzerResult,
  type AnalyzerSubject,
  fallbackGeneralResult,
  inspectTestContext,
  runSubjectAnalyzer,
} from '@/lib/analyzer-agents';
import abSchoolDataset from '@/lib/data/ab-school-rankings.json';
import bcSchoolDataset from '@/lib/data/bc-school-rankings.json';
import nbSchoolDataset from '@/lib/data/nb-school-rankings.json';
import nlSchoolDataset from '@/lib/data/nl-school-rankings.json';
import nsSchoolDataset from '@/lib/data/ns-school-rankings.json';
import qcSchoolDataset from '@/lib/data/qc-school-rankings.json';
import onSchoolDataset from '@/lib/data/on-school-rankings.json';
import peiSchoolDataset from '@/lib/data/pei-school-rankings.json';
import mbSchoolDataset from '@/lib/data/mb-school-rankings.json';
import skSchoolDataset from '@/lib/data/sk-school-rankings.json';
import ntSchoolDataset from '@/lib/data/nt-school-rankings.json';
import ytSchoolDataset from '@/lib/data/yt-school-rankings.json';

const envAnalyzerAssistantId = process.env.BACKBOARD_ANALYZER_ASSISTANT_ID;
const envAnalyzerThreadId = process.env.BACKBOARD_ANALYZER_THREAD_ID;
const envAnalyzerSystemPrompt = process.env.BACKBOARD_ANALYZER_SYSTEM_PROMPT;

const DEFAULT_ANALYZER_SYSTEM_PROMPT = `You are AXIOM Analyzer Orchestrator.

Your job is tool orchestration only.

Available tools:
- inspect_test_context: inspect payload and infer best analyzer subject route
- analyze_math_test
- analyze_physics_test
- analyze_english_test
- analyze_chemistry_test
- analyze_biology_test
- analyze_general_test
- remember_analyzer_preference

Rules:
1) Always call inspect_test_context first.
2) Then call exactly one analyzer tool that best matches the test.
3) If confidence is low or mixed-domain, call analyze_general_test.
4) Keep final response concise and mention which analyzer agent was used.
5) If user states stable preferences (e.g. preferred grading philosophy), call remember_analyzer_preference.
`;

const ANALYZER_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'inspect_test_context',
      description: 'Inspect submitted test context and infer the best analyzer subject route.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_math_test',
      description: 'Run specialist math rigor analyzer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_physics_test',
      description: 'Run specialist physics rigor analyzer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_english_test',
      description: 'Run specialist english/language-arts rigor analyzer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_chemistry_test',
      description: 'Run specialist chemistry rigor analyzer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_biology_test',
      description: 'Run specialist biology rigor analyzer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_general_test',
      description: 'Run broad mixed-domain analyzer when subject is unclear or interdisciplinary.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_analyzer_preference',
      description: 'Persist stable analyzer preferences for future runs.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['key', 'value'],
      },
    },
  },
];

const W_D = 2;
const W_S = 1.5;
const D_AVG = 5;

type SchoolRecord = {
  id: string;
  rating: number | null;
  province?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getAllSchools(): SchoolRecord[] {
  const pick = (payload: unknown) => {
    const raw = payload as { schools?: unknown[] };
    return Array.isArray(raw.schools) ? raw.schools : [];
  };

  return [
    ...pick(bcSchoolDataset),
    ...pick(abSchoolDataset),
    ...pick(qcSchoolDataset),
    ...pick(nbSchoolDataset),
    ...pick(onSchoolDataset),
    ...pick(nlSchoolDataset),
    ...pick(nsSchoolDataset),
    ...pick(peiSchoolDataset),
    ...pick(mbSchoolDataset),
    ...pick(skSchoolDataset),
    ...pick(ntSchoolDataset),
    ...pick(ytSchoolDataset),
  ] as SchoolRecord[];
}

const ALL_SCHOOLS = getAllSchools();

function getProvinceMedianRating(province: string): number {
  const target = province.toUpperCase();
  const ratings = ALL_SCHOOLS
    .filter((school) => school.province?.toUpperCase() === target && school.rating != null)
    .map((school) => Number(school.rating))
    .filter((rating) => Number.isFinite(rating))
    .sort((a, b) => a - b);

  if (ratings.length === 0) return 5;
  const mid = Math.floor(ratings.length / 2);
  return ratings.length % 2 === 0 ? (ratings[mid - 1] + ratings[mid]) / 2 : ratings[mid];
}

function computeFormulaAdjustment(input: AnalyzerInput, estimatedDifficulty: number) {
  const schoolContext =
    input.school && typeof input.school === 'object' && !Array.isArray(input.school) ? input.school : undefined;
  const schoolId = typeof schoolContext?.id === 'string' ? schoolContext.id : '';
  const school = schoolId ? ALL_SCHOOLS.find((entry) => entry.id === schoolId) : undefined;
  const province =
    (typeof schoolContext?.province === 'string' && schoolContext.province.trim()) ||
    input.province ||
    school?.province ||
    'BC';

  const provinceMedianRating = getProvinceMedianRating(province);
  const schoolRating = school?.rating ?? provinceMedianRating;
  const classAverage = clamp(input.classAverage, 0, 100);
  const difficulty = clamp(estimatedDifficulty, 1, 10);
  const mAdj = clamp(
    classAverage + W_D * (difficulty - D_AVG) + W_S * (schoolRating - provinceMedianRating),
    0,
    100
  );
  const adjustmentFactor = mAdj - classAverage;

  return {
    adjustmentFactor: Number(adjustmentFactor.toFixed(2)),
    estimatedDifficulty: Number(difficulty.toFixed(2)),
    mAdj: Number(mAdj.toFixed(2)),
    schoolRating: Number(schoolRating.toFixed(2)),
    provinceMedianRating: Number(provinceMedianRating.toFixed(2)),
  };
}

let cachedClient: any = null;
let analyzerAssistantId: string | null = envAnalyzerAssistantId ?? null;
let analyzerAssistantConfigured = false;
let fallbackAnalyzerThreadId: string | null = envAnalyzerThreadId ?? null;
const analyzerSessionToThread = new Map<string, string>();

function hasBackboardConfig() {
  return Boolean(process.env.BACKBOARD_API_KEY);
}

function parseArgs(raw: any) {
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function safeJsonParse(raw: unknown) {
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

function extractResponseContent(response: any): string {
  if (typeof response?.content === 'string') return response.content;
  if (Array.isArray(response?.content)) {
    const text = response.content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
    if (text) return text;
  }
  return '(no answer)';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBackboardError(error: any) {
  const statusCode = Number(error?.statusCode);
  if ([429, 502, 503, 504].includes(statusCode)) return true;
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('http 502') ||
    message.includes('http 503') ||
    message.includes('http 504') ||
    message.includes('bad gateway') ||
    message.includes('gateway timeout')
  );
}

async function withBackboardRetry<T>(action: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetryableBackboardError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(350 * attempt);
    }
  }
  throw lastError;
}

function parseInput(body: any): AnalyzerInput {
  const classAverage = Number(body?.classAverage);

  if (!Number.isFinite(classAverage)) {
    throw new Error('Invalid classAverage.');
  }

  const testContent = typeof body?.testContent === 'string' ? body.testContent.trim() : undefined;
  const pdfData = typeof body?.pdfData === 'string' ? body.pdfData : undefined;

  if (!testContent && !pdfData) {
    throw new Error('Missing required fields: classAverage and either testContent or pdfData');
  }

  const province = typeof body?.province === 'string' ? body.province : undefined;
  const school =
    typeof body?.school === 'string' || (body?.school && typeof body.school === 'object')
      ? body.school
      : undefined;

  return {
    classAverage,
    province,
    school,
    testContent,
    pdfData,
  };
}

function subjectFromToolName(toolName: string): AnalyzerSubject | null {
  if (toolName === 'analyze_math_test') return 'math';
  if (toolName === 'analyze_physics_test') return 'physics';
  if (toolName === 'analyze_english_test') return 'english';
  if (toolName === 'analyze_chemistry_test') return 'chemistry';
  if (toolName === 'analyze_biology_test') return 'biology';
  if (toolName === 'analyze_general_test') return 'general';
  return null;
}

async function getBackboardClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) throw new Error('BACKBOARD_API_KEY is not set.');

  const { BackboardClient } = await import('backboard-sdk');
  cachedClient = new BackboardClient({ apiKey });
  return cachedClient;
}

async function ensureAnalyzerAssistant(client: any, systemPrompt?: string): Promise<string> {
  const prompt = systemPrompt ?? envAnalyzerSystemPrompt ?? DEFAULT_ANALYZER_SYSTEM_PROMPT;

  if (!analyzerAssistantId) {
    const created = await client.createAssistant({
      name: 'Axiom Analyzer Orchestrator',
      system_prompt: prompt,
      tools: ANALYZER_TOOL_DEFINITIONS,
    });

    analyzerAssistantId = created.assistantId;
    analyzerAssistantConfigured = true;

    if (!analyzerAssistantId) {
      throw new Error('Failed to create Backboard analyzer assistant.');
    }

    return analyzerAssistantId;
  }

  if (!analyzerAssistantConfigured || systemPrompt) {
    await client.updateAssistant(analyzerAssistantId, {
      name: 'Axiom Analyzer Orchestrator',
      system_prompt: prompt,
      tools: ANALYZER_TOOL_DEFINITIONS,
    });
    analyzerAssistantConfigured = true;
  }

  if (!analyzerAssistantId) {
    throw new Error('Backboard analyzer assistant is unavailable.');
  }

  return analyzerAssistantId;
}

async function ensureAnalyzerThread(
  client: any,
  assistant: string,
  threadIdFromBody?: string | null,
  sessionId?: string | null
) {
  if (threadIdFromBody) {
    if (sessionId) analyzerSessionToThread.set(sessionId, threadIdFromBody);
    return threadIdFromBody;
  }

  if (sessionId) {
    const mapped = analyzerSessionToThread.get(sessionId);
    if (mapped) return mapped;
  }

  if (fallbackAnalyzerThreadId && !sessionId) {
    return fallbackAnalyzerThreadId;
  }

  const created = await client.createThread(assistant);
  const resolved = created.threadId ?? created?.id ?? created?.thread_id ?? null;

  if (!resolved) {
    throw new Error('Could not resolve analyzer thread ID from Backboard response.');
  }

  if (sessionId) {
    analyzerSessionToThread.set(sessionId, resolved);
  } else {
    fallbackAnalyzerThreadId = resolved;
  }

  return resolved;
}

async function executeAnalyzerToolCall({
  toolName,
  input,
  geminiApiKey,
  latestInspection,
}: {
  toolName: string;
  input: AnalyzerInput;
  geminiApiKey: string;
  latestInspection: AnalyzerInspection | null;
}): Promise<AnalyzerInspection | AnalyzerResult | Record<string, unknown>> {
  if (toolName === 'inspect_test_context') {
    return inspectTestContext(input, geminiApiKey);
  }

  const subject = subjectFromToolName(toolName);
  if (subject) {
    return runSubjectAnalyzer({
      subject,
      input,
      apiKey: geminiApiKey,
      forcedQuestionStyle: latestInspection?.questionStyle,
    });
  }

  if (toolName === 'remember_preference') {
    return {
      stored: true,
      note: 'Deprecated preference tool alias ignored.',
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

async function maybePersistAnalyzerPreference({
  client,
  assistant,
  sessionId,
  args,
}: {
  client: any;
  assistant: string;
  sessionId?: string | null;
  args: any;
}) {
  const key = String(args.key ?? '').trim().slice(0, 120);
  const value = String(args.value ?? '').trim().slice(0, 300);

  if (!key || !value) {
    return { stored: false, error: 'Both key and value are required.' };
  }

  await client.addMemory(assistant, {
    content: `Analyzer preference: ${key}=${value}`,
    metadata: {
      type: 'analyzer_preference',
      key,
      sessionId: sessionId ?? 'unknown',
    },
  });

  return { stored: true, key, value };
}

async function runBackboardAnalyzer({
  input,
  sessionId,
  threadIdFromBody,
  systemPrompt,
}: {
  input: AnalyzerInput;
  sessionId?: string | null;
  threadIdFromBody?: string | null;
  systemPrompt?: string;
}) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  const client = await getBackboardClient();
  const assistant = await ensureAnalyzerAssistant(client, systemPrompt);
  const thread = await ensureAnalyzerThread(client, assistant, threadIdFromBody, sessionId);

  const preview = (input.testContent ?? '').slice(0, 3500);
  const initialMessage = [
    'New analyzer request:',
    `- Class average: ${input.classAverage}%`,
    `- Province: ${input.province ?? 'Unknown'}`,
    `- School: ${typeof input.school === 'string' ? input.school : input.school?.name ?? 'N/A'}`,
    `- PDF attached in payload: ${input.pdfData ? 'yes' : 'no'}`,
    preview ? `- Notes preview:\n${preview}` : '- Notes preview: (none)',
    '',
    'Follow your rules: inspect_test_context first, then exactly one analyze_* tool.',
  ].join('\n');

  let response: any = await withBackboardRetry<any>(() =>
    client.addMessage(thread, {
      content: initialMessage,
      stream: false,
      memory: 'Auto',
    })
  );

  const toolTrace: string[] = [];
  let latestInspection: AnalyzerInspection | null = null;
  let latestResult: AnalyzerResult | null = null;
  let iterations = 0;

  while (
    response?.status === 'REQUIRES_ACTION' &&
    Array.isArray(response?.toolCalls) &&
    response.toolCalls.length > 0 &&
    iterations < 8
  ) {
    const outputs: Array<{ tool_call_id: string; output: string }> = [];

    for (const toolCall of response.toolCalls) {
      const toolName = String(toolCall?.function?.name ?? '');
      const args = parseArgs(toolCall?.function?.parsedArguments ?? safeJsonParse(toolCall?.function?.arguments));

      let output: any;

      if (toolName === 'remember_analyzer_preference') {
        output = await maybePersistAnalyzerPreference({
          client,
          assistant,
          sessionId,
          args,
        });
      } else {
        output = await executeAnalyzerToolCall({
          toolName,
          input,
          geminiApiKey,
          latestInspection,
        });
      }

      if (toolName === 'inspect_test_context' && output && typeof output === 'object') {
        latestInspection = output as AnalyzerInspection;
      }

      if (subjectFromToolName(toolName) && output && typeof output === 'object') {
        latestResult = output as AnalyzerResult;
      }

      toolTrace.push(toolName || 'unknown_tool');
      outputs.push({
        tool_call_id: String(toolCall?.id ?? ''),
        output: JSON.stringify(output),
      });
    }

    if (!response?.runId || outputs.length === 0) break;
    response = await withBackboardRetry<any>(() =>
      client.submitToolOutputs(thread, response.runId, outputs)
    );
    iterations += 1;
  }

  if (!latestResult) {
    const fallbackSubject = latestInspection?.subject ?? 'general';
    try {
      latestResult = await runSubjectAnalyzer({
        subject: fallbackSubject,
        input,
        apiKey: geminiApiKey,
        forcedQuestionStyle: latestInspection?.questionStyle,
      });
      toolTrace.push(`fallback_analyze_${fallbackSubject}`);
    } catch {
      latestResult = fallbackGeneralResult(
        fallbackSubject,
        'Backboard routing completed, but analyzer model failed to return a structured result.'
      );
    }
  }

  return {
    result: latestResult,
    threadId: thread,
    assistantId: assistant,
    toolTrace,
    inspection: latestInspection,
    answer: extractResponseContent(response),
    status: response?.status ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseInput(body);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : null;
    const threadIdFromBody = typeof body?.threadId === 'string' ? body.threadId.trim() : null;
    const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : undefined;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' },
        { status: 503 }
      );
    }

    if (!hasBackboardConfig()) {
      const result = await runSubjectAnalyzer({
        subject: 'general',
        input,
        apiKey: geminiApiKey,
      });
      const formula = computeFormulaAdjustment(input, result.estimatedDifficulty);

      return NextResponse.json({
        success: true,
        mode: 'direct-fallback',
        result: {
          ...result,
          adjustmentFactor: formula.adjustmentFactor,
          estimatedDifficulty: formula.estimatedDifficulty,
          rationale: '',
          curriculumAlignment: '',
        },
        formula,
      });
    }

    let routed:
      | Awaited<ReturnType<typeof runBackboardAnalyzer>>
      | null = null;
    let mode = 'backboard-tools';
    let backboardFallbackWarning: string | null = null;

    try {
      routed = await runBackboardAnalyzer({
        input,
        sessionId,
        threadIdFromBody,
        systemPrompt,
      });
    } catch (backboardError: any) {
      console.error('Backboard analyzer failed, falling back to direct analyzer:', backboardError);
      let inspection: AnalyzerInspection;
      try {
        inspection = await inspectTestContext(input, geminiApiKey);
      } catch {
        inspection = {
          subject: 'general',
          confidence: 0.4,
          questionStyle: 'mixed',
          reasoning: 'Inspection fallback after Backboard failure',
        };
      }
      const fallbackResult = await runSubjectAnalyzer({
        subject: inspection.subject,
        input,
        apiKey: geminiApiKey,
        forcedQuestionStyle: inspection.questionStyle,
      });
      routed = {
        result: fallbackResult,
        threadId: threadIdFromBody ?? '',
        assistantId: analyzerAssistantId ?? '',
        toolTrace: ['backboard_unavailable_fallback'],
        inspection,
        answer: 'Backboard unavailable. Used direct analyzer fallback.',
        status: 'FALLBACK',
      };
      mode = 'backboard-fallback';
      backboardFallbackWarning = 'Backboard temporarily unavailable (HTTP 502). Used direct analyzer fallback.';
    }
    const formula = computeFormulaAdjustment(input, routed.result.estimatedDifficulty);

    return NextResponse.json({
      success: true,
      mode,
      result: {
        ...routed.result,
        adjustmentFactor: formula.adjustmentFactor,
        estimatedDifficulty: formula.estimatedDifficulty,
        rationale: '',
        curriculumAlignment: '',
      },
      formula,
      threadId: routed.threadId,
      assistantId: routed.assistantId,
      toolTrace: routed.toolTrace,
      inspection: routed.inspection,
      answer: routed.answer,
      status: routed.status,
      warning: backboardFallbackWarning,
    });
  } catch (error: any) {
    console.error('Error analyzing test:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to analyze test' },
      { status: 500 }
    );
  }
}
