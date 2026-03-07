import { NextRequest, NextResponse } from "next/server";
import { BackboardClient } from "backboard-sdk";

const apiKey = process.env.BACKBOARD_API_KEY;
const envAssistantId = process.env.BACKBOARD_ASSISTANT_ID;
const envThreadId = process.env.BACKBOARD_THREAD_ID;
const envSystemPrompt = process.env.BACKBOARD_SYSTEM_PROMPT;

if (!apiKey) {
  throw new Error("BACKBOARD_API_KEY must be set in environment variables");
}

// TypeScript doesn’t always narrow this correctly in nested functions, so ensure
// we treat it as a non-null string when passing it into the SDK.
const nonNullApiKey: string = apiKey;

let client: BackboardClient | null = null;
let assistantId: string | null = envAssistantId ?? null;
let threadId: string | null = envThreadId ?? null;

async function getClient() {
  if (!client) {
    client = new BackboardClient({ apiKey: nonNullApiKey });
  }
  return client;
}

async function ensureAssistant(systemPrompt?: string): Promise<string> {
  if (assistantId) {
    console.log("Reusing assistant", assistantId);
    return assistantId;
  }

  const c = await getClient();
  const assistant = await c.createAssistant({
    name: "Axiom Support Assistant",
    system_prompt:
      systemPrompt ??
      envSystemPrompt ??
      "You are an assistant that answers questions using only the BC school rankings dataset. The dataset includes these columns: rank_2023_2024, rank_5yr, trend_symbol, trend, school_name, city, overall_rating_2023_2024, overall_rating_5yr. When answering, only use information that can be directly derived from these columns (do not hallucinate other data). Keep answers concise and focus on the requested comparison, ranking, or trend.",
  });

  assistantId = assistant.assistantId;
  console.log("Created assistant", assistantId);
  return assistantId;
}

async function ensureThread(): Promise<string> {
  if (threadId) {
    console.log("Reusing thread", threadId);
    return threadId;
  }

  const c = await getClient();
  const currentAssistantId = await ensureAssistant();
  console.log("Creating thread for assistant", currentAssistantId);
  const thread = await c.createThread(currentAssistantId);
  console.log("thread result keys", Object.keys(thread));
  console.log("thread result", thread);
  threadId = thread.threadId ?? thread?.id ?? thread?.thread_id;

  if (!threadId) {
    throw new Error("Could not resolve thread ID from Backboard response");
  }

  console.log("Resolved threadId", threadId);
  return threadId;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const systemPrompt = typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : undefined;

    if (!question) {
      return NextResponse.json(
        { error: "Missing required field: question" },
        { status: 400 }
      );
    }

    const assistant = await ensureAssistant(systemPrompt);
    const thread = await ensureThread();

    const c = await getClient();

    const response = await c.addMessage(thread, {
      content: question,
      stream: false,
    });

    const answer =
      response && typeof response === "object" && "content" in response
        ? (response as any).content
        : "";

    return NextResponse.json({
      success: true,
      answer,
      threadId: thread,
      assistantId: assistant,
    });
  } catch (error: any) {
    console.error("Backboard API error:", error);

    let details = "";
    try {
      details = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    } catch {
      details = String(error);
    }

    // Log response body if available
    if (error?.response) {
      try {
        const resp = await error.response.text();
        console.error("Backboard response body:", resp);
        details += `\nresponseBody: ${resp}`;
      } catch {
        // ignore
      }
    }

    console.error("Backboard error details:", details);

    const message =
      error?.message ??
      (details ? details : "Unknown error from Backboard API");

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
