import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testContent, classAverage, subject } = body;

    if (!testContent || !classAverage || !subject) {
      return NextResponse.json(
        { error: 'Missing required fields: testContent, classAverage, subject' },
        { status: 400 }
      );
    }

    // Use the server config key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });



    const prompt = `
You are an expert educational evaluator assessing the difficulty of a high school test.

SUBJECT: ${subject}
CLASS AVERAGE SCORE: ${classAverage}%

TEST CONTENT:
"""
${testContent}
"""

Instructions:
1. Evaluate the inherent difficulty of the test content above on a scale from 1.0 to 10.0 (where 5.0 represents a completely standard, average high school test difficulty).
2. Consider the CLASS AVERAGE SCORE. If the test is very difficult (e.g., 8.0) and the class average is high (e.g., 85%), this indicates exceptionally strong students who are mastering highly difficult material and should be rewarded. Give a positive adjustment factor in this case. If the test is very easy (e.g., 3.0) and the average is high (e.g., 90%), this strongly indicates grade inflation (negative adjustment).
3. Calculate an "Adjustment Factor" (from -15.0 to +15.0). 
   - A positive adjustment factor means the school grades HARDER than average (deflation) OR students are performing exceptionally well on very difficult material.
   - A negative adjustment factor means the school grades EASIER than average (inflation).
   - Example 1: Extremely easy test + High Average = Large Negative Adjustment (e.g., -8.5).
   - Example 2: Extremely hard test + High Average = Large Positive Adjustment (e.g., +8.5) because the students are exceptional.
   - Example 3: Standard test + Standard Average (e.g., 75%) = Near 0 Adjustment.

Respond ONLY with a valid JSON object matching this exact structure, with no markdown formatting or backticks:
{
  "estimatedDifficulty": 5.5,
  "adjustmentFactor": -2.3,
  "rationale": "A brief, 2-sentence explanation of why you chose this adjustment factor based on the test content and class average."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    
    if (!text) {
      throw new Error("No response from AI");
    }
    
    // The SDK with responseMimeType should return parseable JSON
    const data = JSON.parse(text);

    return NextResponse.json({
      success: true,
      result: data
    });

  } catch (error: any) {
    console.error('Error analyzing test:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze test' },
      { status: 500 }
    );
  }
}
