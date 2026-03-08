import { NextRequest, NextResponse } from 'next/server';
import {
  compareSchools,
  getSchoolsByIds,
  getSchoolDetails,
  runSchoolAgentQuery,
  searchSchools,
  type SchoolAgentSchoolResult,
  SCHOOL_AGENT_COVERAGE,
} from '@/lib/school-agent';

type ApiMode = 'auto' | 'school-agent' | 'backboard' | 'backboard-tools';

const envAssistantId = process.env.BACKBOARD_ASSISTANT_ID;
const envThreadId = process.env.BACKBOARD_THREAD_ID;
const envSystemPrompt = process.env.BACKBOARD_SYSTEM_PROMPT;

const DEFAULT_SYSTEM_PROMPT = `You are Axiom School Agent for Canadian high schools.

You must use tools for factual dataset answers:
- search_schools: filter and rank schools
- school_details: one school profile
- compare_schools: compare named schools
- remember_preference: persist user preference for future sessions

Rules:
1) For ranking/count/filter questions, always call search_schools before answering.
2) For "tell me about X school", call school_details.
3) For comparisons, call compare_schools.
4) Keep answers grounded in tool outputs and cite limitations.
5) If user expresses stable preference (province/city/threshold), call remember_preference.
6) Keep responses concise and practical.
7) Use plain text only. Do not use markdown formatting like **bold**, bullets, or headings.
`;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_schools',
      description: `Search and rank schools from dataset coverage ${SCHOOL_AGENT_COVERAGE}.`,
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Exact city name (optional)' },
          province: { type: 'string', description: 'Province code or name, e.g. BC, Alberta, Quebec' },
          schoolNameQuery: { type: 'string', description: 'Partial school name match' },
          minRating: { type: 'number', description: 'Minimum rating threshold from 0 to 10' },
          maxRating: { type: 'number', description: 'Maximum rating threshold from 0 to 10' },
          sort: { type: 'string', enum: ['best', 'worst'], description: 'Sort direction by performance' },
          limit: { type: 'integer', description: 'Max rows to return (1-25)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'school_details',
      description: 'Get details for one school by name and optional location filters.',
      parameters: {
        type: 'object',
        properties: {
          schoolName: { type: 'string', description: 'School name to resolve' },
          city: { type: 'string', description: 'Optional city disambiguation' },
          province: { type: 'string', description: 'Optional province disambiguation' },
        },
        required: ['schoolName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_schools',
      description: 'Compare a list of school names by available ranking/rating data.',
      parameters: {
        type: 'object',
        properties: {
          schoolNames: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 8,
            description: 'Two or more school names',
          },
        },
        required: ['schoolNames'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_preference',
      description:
        'Persist stable user preferences for future conversations (e.g., preferred city, province, rating thresholds).',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Preference key, e.g. preferred_city' },
          value: { type: 'string', description: 'Preference value' },
        },
        required: ['key', 'value'],
      },
    },
  },
];

let cachedClient: any = null;
let assistantId: string | null = envAssistantId ?? null;
let assistantConfigured = false;
let fallbackThreadId: string | null = envThreadId ?? null;
const sessionToThread = new Map<string, string>();

function hasBackboardConfig() {
  return Boolean(process.env.BACKBOARD_API_KEY);
}

function normalizeMode(value: unknown): ApiMode {
  if (value === 'school-agent') return 'school-agent';
  if (value === 'backboard') return 'backboard';
  if (value === 'backboard-tools') return 'backboard-tools';
  return 'auto';
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

function toPlainConciseText(answer: string) {
  const text = String(answer ?? '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) return '(no answer)';

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 4).join('\n');
}

function extractRecommendedIds(toolName: string, output: any): string[] {
  if (!output || typeof output !== 'object') return [];

  if (toolName === 'search_schools') {
    if (!Array.isArray(output.results)) return [];
    return output.results.map((row: any) => String(row?.id ?? '')).filter(Boolean);
  }

  if (toolName === 'school_details') {
    const id = output?.school?.id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  }

  if (toolName === 'compare_schools') {
    if (!Array.isArray(output.compared)) return [];
    return output.compared.map((row: any) => String(row?.id ?? '')).filter(Boolean);
  }

  return [];
}

function mergeUniqueIds(base: string[], incoming: string[]) {
  if (incoming.length === 0) return base;
  const seen = new Set(base);
  const next = [...base];
  for (const value of incoming) {
    if (!seen.has(value)) {
      seen.add(value);
      next.push(value);
    }
  }
  return next;
}

async function getBackboardClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) throw new Error('BACKBOARD_API_KEY is not set.');

  const { BackboardClient } = await import('backboard-sdk');
  cachedClient = new BackboardClient({ apiKey });
  return cachedClient;
}

async function ensureAssistant(client: any, systemPrompt?: string): Promise<string> {
  const prompt = systemPrompt ?? envSystemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  if (!assistantId) {
    const created = await client.createAssistant({
      name: 'Axiom School Agent',
      system_prompt: prompt,
      tools: TOOL_DEFINITIONS,
    });
    assistantId = created.assistantId;
    assistantConfigured = true;
    if (!assistantId) {
      throw new Error('Failed to create Backboard assistant.');
    }
    return assistantId;
  }

  if (!assistantConfigured || systemPrompt) {
    await client.updateAssistant(assistantId, {
      name: 'Axiom School Agent',
      system_prompt: prompt,
      tools: TOOL_DEFINITIONS,
    });
    assistantConfigured = true;
  }

  if (!assistantId) {
    throw new Error('Backboard assistant is unavailable.');
  }
  return assistantId;
}

async function ensureThread(client: any, assistant: string, threadIdFromBody?: string | null, sessionId?: string | null) {
  if (threadIdFromBody) {
    if (sessionId) sessionToThread.set(sessionId, threadIdFromBody);
    return threadIdFromBody;
  }

  if (sessionId) {
    const mapped = sessionToThread.get(sessionId);
    if (mapped) return mapped;
  }

  if (fallbackThreadId && !sessionId) {
    return fallbackThreadId;
  }

  const created = await client.createThread(assistant);
  const resolved = created.threadId ?? created?.id ?? created?.thread_id ?? null;
  if (!resolved) {
    throw new Error('Could not resolve thread ID from Backboard response.');
  }

  if (sessionId) {
    sessionToThread.set(sessionId, resolved);
  } else {
    fallbackThreadId = resolved;
  }

  return resolved;
}

async function executeToolCall({
  client,
  assistant,
  sessionId,
  toolName,
  args,
}: {
  client: any;
  assistant: string;
  sessionId?: string | null;
  toolName: string;
  args: any;
}) {
  if (toolName === 'search_schools') {
    return searchSchools({
      city: typeof args.city === 'string' ? args.city : undefined,
      province: typeof args.province === 'string' ? args.province : undefined,
      schoolNameQuery: typeof args.schoolNameQuery === 'string' ? args.schoolNameQuery : undefined,
      minRating: typeof args.minRating === 'number' ? args.minRating : undefined,
      maxRating: typeof args.maxRating === 'number' ? args.maxRating : undefined,
      sort: args.sort === 'worst' ? 'worst' : 'best',
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    });
  }

  if (toolName === 'school_details') {
    return getSchoolDetails({
      schoolName: String(args.schoolName ?? ''),
      city: typeof args.city === 'string' ? args.city : undefined,
      province: typeof args.province === 'string' ? args.province : undefined,
    });
  }

  if (toolName === 'compare_schools') {
    const schoolNames = Array.isArray(args.schoolNames) ? args.schoolNames.map((value: any) => String(value)) : [];
    return compareSchools({ schoolNames });
  }

  if (toolName === 'remember_preference') {
    const key = String(args.key ?? '').trim().slice(0, 120);
    const value = String(args.value ?? '').trim().slice(0, 300);
    if (!key || !value) {
      return { stored: false, error: 'Both key and value are required.' };
    }

    await client.addMemory(assistant, {
      content: `User preference: ${key}=${value}`,
      metadata: {
        type: 'user_preference',
        key,
        sessionId: sessionId ?? 'unknown',
      },
    });

    return { stored: true, key, value };
  }

  return { error: `Unknown tool: ${toolName}` };
}

async function runBackboardPlain({
  question,
  systemPrompt,
  sessionId,
  threadIdFromBody,
}: {
  question: string;
  systemPrompt?: string;
  sessionId?: string | null;
  threadIdFromBody?: string | null;
}) {
  const client = await getBackboardClient();
  const assistant = await ensureAssistant(client, systemPrompt);
  const thread = await ensureThread(client, assistant, threadIdFromBody, sessionId);

  const response = await client.addMessage(thread, {
    content: question,
    stream: false,
    memory: 'Auto',
  });

  return {
    answer: toPlainConciseText(extractResponseContent(response)),
    threadId: thread,
    assistantId: assistant,
    status: response?.status ?? null,
    toolTrace: [] as string[],
    recommendedSchoolIds: [] as string[],
    results: [] as SchoolAgentSchoolResult[],
  };
}

async function runBackboardWithTools({
  question,
  systemPrompt,
  sessionId,
  threadIdFromBody,
}: {
  question: string;
  systemPrompt?: string;
  sessionId?: string | null;
  threadIdFromBody?: string | null;
}) {
  const client = await getBackboardClient();
  const assistant = await ensureAssistant(client, systemPrompt);
  const thread = await ensureThread(client, assistant, threadIdFromBody, sessionId);

  let response = await client.addMessage(thread, {
    content: question,
    stream: false,
    memory: 'Auto',
  });

  const toolTrace: string[] = [];
  let recommendedSchoolIds: string[] = [];
  let iterations = 0;

  while (
    response?.status === 'REQUIRES_ACTION' &&
    Array.isArray(response?.toolCalls) &&
    response.toolCalls.length > 0 &&
    iterations < 6
  ) {
    const outputs: Array<{ tool_call_id: string; output: string }> = [];

    for (const toolCall of response.toolCalls) {
      const toolName = String(toolCall?.function?.name ?? '');
      const args = parseArgs(toolCall?.function?.parsedArguments ?? safeJsonParse(toolCall?.function?.arguments));
      const output = await executeToolCall({
        client,
        assistant,
        sessionId,
        toolName,
        args,
      });

      const extractedIds = extractRecommendedIds(toolName, output);
      if (extractedIds.length > 0) {
        recommendedSchoolIds = mergeUniqueIds(recommendedSchoolIds, extractedIds);
      }

      toolTrace.push(toolName || 'unknown_tool');
      outputs.push({
        tool_call_id: String(toolCall?.id ?? ''),
        output: JSON.stringify(output),
      });
    }

    if (!response?.runId || outputs.length === 0) break;
    response = await client.submitToolOutputs(thread, response.runId, outputs);
    iterations += 1;
  }

  return {
    answer: toPlainConciseText(extractResponseContent(response)),
    threadId: thread,
    assistantId: assistant,
    status: response?.status ?? null,
    toolTrace,
    recommendedSchoolIds,
    results: getSchoolsByIds(recommendedSchoolIds, 12),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : undefined;
    const requestedMode = normalizeMode(body?.mode);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : null;
    const threadIdFromBody = typeof body?.threadId === 'string' ? body.threadId.trim() : null;

    if (!question) {
      return NextResponse.json({ error: 'Missing required field: question' }, { status: 400 });
    }

    const mode: ApiMode =
      requestedMode === 'auto' ? (hasBackboardConfig() ? 'backboard-tools' : 'school-agent') : requestedMode;

    if (mode === 'school-agent') {
      const result = runSchoolAgentQuery(question);
      return NextResponse.json({
        success: true,
        mode: 'school-agent',
        answer: result.answer,
        appliedFilters: result.appliedFilters,
        results: result.results,
        recommendedSchoolIds: result.results.map((row) => row.id),
        meta: result.meta,
      });
    }

    if (!hasBackboardConfig()) {
      const result = runSchoolAgentQuery(question);
      return NextResponse.json({
        success: true,
        mode: 'school-agent',
        fallback: true,
        answer: result.answer,
        appliedFilters: result.appliedFilters,
        results: result.results,
        recommendedSchoolIds: result.results.map((row) => row.id),
        meta: result.meta,
      });
    }

    const backboardResult =
      mode === 'backboard'
        ? await runBackboardPlain({ question, systemPrompt, sessionId, threadIdFromBody })
        : await runBackboardWithTools({ question, systemPrompt, sessionId, threadIdFromBody });

    return NextResponse.json({
      success: true,
      mode,
      answer: backboardResult.answer,
      results: backboardResult.results,
      threadId: backboardResult.threadId,
      assistantId: backboardResult.assistantId,
      status: backboardResult.status,
      toolTrace: backboardResult.toolTrace,
      recommendedSchoolIds: backboardResult.recommendedSchoolIds,
    });
  } catch (error: any) {
    console.error('School agent API error:', error);
    return NextResponse.json({ error: error?.message ?? 'Unknown server error' }, { status: 500 });
  }
}
