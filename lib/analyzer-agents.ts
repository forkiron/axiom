import { GoogleGenAI } from '@google/genai';

export type AnalyzerSubject = 'math' | 'physics' | 'english' | 'chemistry' | 'biology' | 'general';

export interface AnalyzerSchoolContext {
  id?: string;
  name?: string;
  city?: string;
  province?: string;
}

export interface AnalyzerInput {
  classAverage: number;
  province?: string;
  school?: string | AnalyzerSchoolContext;
  testContent?: string;
  pdfData?: string;
}

export interface AnalyzerInspection {
  subject: AnalyzerSubject;
  confidence: number;
  questionStyle: string;
  reasoning: string;
}

export interface AnalyzerResult {
  estimatedDifficulty: number;
  adjustmentFactor: number;
  rationale: string;
  curriculumAlignment?: string;
  questionStyle?: string;
  questionCount?: number;
  selectedAgent: AnalyzerSubject;
  agentLabel: string;
}

const PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland & Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const SUBJECT_LABELS: Record<AnalyzerSubject, string> = {
  math: 'Math Analyzer',
  physics: 'Physics Analyzer',
  english: 'English Analyzer',
  chemistry: 'Chemistry Analyzer',
  biology: 'Biology Analyzer',
  general: 'General Analyzer',
};

const SUBJECT_CRITERIA: Record<AnalyzerSubject, string> = {
  math: `Prioritize:
- Multi-step derivations/proofs and symbolic manipulation load
- Conceptual abstraction vs direct procedural computation
- Error sensitivity (small arithmetic/algebra mistakes causing large score drops)
- Time pressure per question, especially for long-form problems`,
  physics: `Prioritize:
- Conceptual modeling and applied reasoning under constraints
- Unit consistency, dimensional analysis, and formula selection ambiguity
- Multi-representation translation (word problems, graphs, equations)
- Partial-credit dynamics for setup vs final numeric answer`,
  english: `Prioritize:
- Argument depth, evidence quality, and interpretation sophistication
- Rubric strictness and grading subjectivity/consistency risks
- Writing quality demands (structure, clarity, precision, style)
- Reading load and inference complexity relative to time`,
  chemistry: `Prioritize:
- Stoichiometry and reaction reasoning depth, not just recall
- Multi-step quantitative setup and calculation burden
- Concept integration across topics (equilibrium, kinetics, thermodynamics)
- Lab-style interpretation and error propagation in reasoning`,
  biology: `Prioritize:
- Recall vs application/analysis balance
- Data interpretation (tables/graphs/experiments) and causal reasoning
- Terminology precision and conceptual linkage across systems
- Case-based question complexity under time limits`,
  general: `Prioritize:
- Overall cognitive load and reasoning depth
- Breadth vs depth of tested material
- Question style mix and time pressure
- Likely grading strictness given response format`,
};

function normalizeJsonText(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function provinceLabel(value?: string) {
  if (!value) return 'Unknown';
  return PROVINCE_NAMES[value] ?? value;
}

function schoolLabel(school?: string | AnalyzerSchoolContext) {
  if (!school) return '';
  if (typeof school === 'string') return school;
  const name = school.name ?? 'Unknown School';
  const city = school.city ?? 'Unknown City';
  const province = school.province ?? 'Unknown Province';
  return `${name} (${city}, ${province})`;
}

function toNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toOptionalNumber(value: unknown, min: number, max: number) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function toSubject(value: unknown): AnalyzerSubject {
  const raw = String(value ?? '').toLowerCase().trim();
  if (raw.startsWith('math')) return 'math';
  if (raw.startsWith('physics')) return 'physics';
  if (raw.startsWith('english')) return 'english';
  if (raw.startsWith('chem')) return 'chemistry';
  if (raw.startsWith('bio')) return 'biology';
  return 'general';
}

async function generateModelJson({
  apiKey,
  prompt,
  pdfData,
}: {
  apiKey: string;
  prompt: string;
  pdfData?: string;
}) {
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];

  if (pdfData) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfData,
      },
    });
  }

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text;
  if (!text) throw new Error('No response from AI model.');
  return JSON.parse(normalizeJsonText(text));
}

export async function inspectTestContext(input: AnalyzerInput, apiKey: string): Promise<AnalyzerInspection> {
  const prompt = `
You are an academic test-router. Determine which specialist analyzer should evaluate the submitted test.

Allowed subjects:
- math
- physics
- english
- chemistry
- biology
- general

Metadata:
- Province: ${provinceLabel(input.province)}
- Class average: ${input.classAverage}%
- School: ${schoolLabel(input.school) || 'N/A'}
- Additional notes:
"""
${(input.testContent ?? '').slice(0, 12000)}
"""

If a PDF is provided, inspect it too.

Return ONLY valid JSON:
{
  "subject": "math|physics|english|chemistry|biology|general",
  "confidence": 0.0,
  "questionStyle": "Plug & Chug | Critical Thinking / Application | Mixed",
  "reasoning": "1-2 sentence routing explanation"
}
`;

  const parsed = await generateModelJson({
    apiKey,
    prompt,
    pdfData: input.pdfData,
  });

  return {
    subject: toSubject(parsed?.subject),
    confidence: toNumber(parsed?.confidence, 0.65, 0, 1),
    questionStyle: String(parsed?.questionStyle ?? 'Mixed'),
    reasoning: String(parsed?.reasoning ?? 'Routed to the most likely subject specialist from available evidence.'),
  };
}

export async function runSubjectAnalyzer({
  subject,
  input,
  apiKey,
  forcedQuestionStyle,
}: {
  subject: AnalyzerSubject;
  input: AnalyzerInput;
  apiKey: string;
  forcedQuestionStyle?: string;
}): Promise<AnalyzerResult> {
  const subjectLabel = SUBJECT_LABELS[subject];
  const criteria = SUBJECT_CRITERIA[subject];
  const province = provinceLabel(input.province);
  const school = schoolLabel(input.school);
  const notes = (input.testContent ?? '').slice(0, 14000);

  const prompt = `
You are ${subjectLabel}, an expert Canadian high-school standardization evaluator.

Goal: estimate only the inherent test difficulty.

Context:
- Subject route selected: ${subject}
- Province / territory: ${province}
- Class average: ${input.classAverage}%
- School context: ${school || 'N/A'}
${forcedQuestionStyle ? `- Routed question style hint: ${forcedQuestionStyle}` : ''}

Evaluation criteria:
${criteria}

Additional notes:
"""
${notes}
"""

Rules:
1) Estimate inherent difficulty from 1.0 to 10.0.
2) Infer approximate question count if possible.
3) Infer question style (Plug & Chug | Critical Thinking / Application | Mixed).
4) Do not output long explanations.

Return ONLY valid JSON with this exact shape:
{
  "estimatedDifficulty": 5.5,
  "questionCount": 24,
  "questionStyle": "Plug & Chug | Critical Thinking / Application | Mixed"
}
`;

  const parsed = await generateModelJson({
    apiKey,
    prompt,
    pdfData: input.pdfData,
  });

  return {
    estimatedDifficulty: toNumber(parsed?.estimatedDifficulty, 5, 1, 10),
    adjustmentFactor: 0,
    questionCount: toOptionalNumber(parsed?.questionCount, 0, 500) ?? undefined,
    questionStyle: String(parsed?.questionStyle ?? forcedQuestionStyle ?? 'Mixed'),
    rationale: 'Difficulty estimated by routed analyzer agent.',
    curriculumAlignment: '',
    selectedAgent: subject,
    agentLabel: subjectLabel,
  };
}

export function fallbackGeneralResult(subject: AnalyzerSubject, reason: string): AnalyzerResult {
  return {
    estimatedDifficulty: 5,
    adjustmentFactor: 0,
    questionStyle: 'Mixed',
    questionCount: undefined,
    rationale: reason,
    curriculumAlignment: 'Unable to compute curriculum alignment from current inputs.',
    selectedAgent: subject,
    agentLabel: SUBJECT_LABELS[subject],
  };
}
