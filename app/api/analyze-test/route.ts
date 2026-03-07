import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const PROVINCE_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland & Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testContent, classAverage, subject, pdfData, province, timeLimit } = body;

    if (!classAverage || !subject || (!testContent && !pdfData)) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, classAverage, and either testContent or pdfData' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const provinceName = province ? (PROVINCE_NAMES[province] ?? province) : 'Unknown';

    const instructionText = `
You are an expert Canadian educational evaluator specializing in high school curriculum standards across Canadian provinces and territories.

SUBJECT: ${subject}
PROVINCE / TERRITORY: ${provinceName}
CLASS AVERAGE SCORE: ${classAverage}%
${timeLimit ? `TIME LIMIT: ${timeLimit} minutes — use the question count you detect to compute and comment on time pressure per question.` : ''}
${testContent ? `\nADDITIONAL CONTEXT:\n"""\n${testContent}\n"""` : ''}

Instructions:
1. Evaluate the inherent difficulty of the test content on a scale from 1.0 to 10.0 (where 5.0 represents a completely standard, average high school test difficulty in Canada).
   When assessing difficulty, explicitly consider ALL of the following factors:
   a) CONTENT DIFFICULTY — how hard are the concepts being tested?
   b) CURRICULUM SCOPE — how much content goes beyond the standard ${provinceName} ${subject} curriculum?
   c) TIME PRESSURE — ${timeLimit ? `The time limit is ${timeLimit} minutes. Count the number of questions yourself from the test content and assess how much time is available per question. Low time per question significantly increases difficulty.` : 'No time limit provided.'}
   d) QUESTION STYLE — Analyze the questions and determine if they are predominantly "Plug & Chug", "Critical Thinking / Application", or "Mixed".
   e) QUESTION COUNT — Count the total number of questions in the test yourself.

2. Consider the CLASS AVERAGE SCORE. If the test is very difficult and the class average is high, this indicates exceptionally strong students (positive adjustment). If the test is easy and the average is high, this indicates grade inflation (negative adjustment).

3. Calculate an "Adjustment Factor" (from -15.0 to +15.0).
   - Positive = school grades harder than average (grade deflation).
   - Negative = school grades easier than average (grade inflation).
   - Example 1: Extremely easy test + High Average = Large Negative (e.g., -8.5).
   - Example 2: Extremely hard test + High Average = Large Positive (e.g., +8.5).
   - Example 3: Standard test + Standard Average (75%) = Near 0.

4. Compare the test against the official ${provinceName} provincial curriculum for ${subject} at the high school level:
   - Are the topics within the provincial curriculum scope?
   - Is the depth/complexity appropriate for this province?
   - How much content, if any, EXCEEDS or falls SHORT of the standard curriculum?

Respond ONLY with a valid JSON object matching this exact structure, with no markdown formatting or backticks:
{
  "estimatedDifficulty": 5.5,
  "adjustmentFactor": -2.3,
  "questionCount": 25,
  "questionStyle": "Plug & Chug | Critical Thinking / Application | Mixed — replace with your detected style",
  "rationale": "A brief, 2-sentence explanation of why you chose this adjustment factor, referencing time pressure, question count, question style, and class average.",
  "curriculumAlignment": "A 2-3 sentence commentary on how well this test aligns with the provincial curriculum, including any notable gaps or topics that exceed or fall short of expectations."
}`;

    // Build the parts array — include PDF inline if provided
    const parts: any[] = [];

    if (pdfData) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfData,
        },
      });
    }

    parts.push({ text: instructionText });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error('No response from AI');
    }

    const data = JSON.parse(text);

    return NextResponse.json({
      success: true,
      result: data,
    });

  } catch (error: any) {
    console.error('Error analyzing test:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze test' },
      { status: 500 }
    );
  }
}
