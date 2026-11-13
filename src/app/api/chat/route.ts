import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { decodeJwt } from "jose";
import Groq from "groq-sdk";
import { JARVIS_INSTRUCTIONS, getGroqTools } from "@/lib/jarvisTools";
import { api } from "../../../../convex/_generated/api";

const DEFAULT_CANDIDATE_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3.8-27b",
];

const CANDIDATE_MODELS = Array.from(
  new Set(
    [process.env.GROQ_MODEL, ...DEFAULT_CANDIDATE_MODELS].filter(Boolean) as string[]
  )
);

let cachedWorkingModel: string | null = null;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key") {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured. Add it to .env.local." },
      { status: 500 }
    );
  }

  // 1. Check Convex Auth JWT
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_CONVEX_URL is not configured." },
      { status: 500 }
    );
  }

  let profileSection = "";
  let userTimezone = "Asia/Kolkata";
  const convex = new ConvexHttpClient(convexUrl);

  if (jwt) {
    convex.setAuth(jwt);

    // Validate JWT format
    try {
      const claims = decodeJwt(jwt);
      if (claims?.exp && claims.exp * 1000 < Date.now()) {
        console.warn("[jarvis] Provided JWT is expired");
      }
    } catch {
      console.warn("[jarvis] Could not parse JWT claims");
    }

    // Try fetching user profile from Convex
    try {
      const user = await convex.query(api.auth.me, {});
      if (user) {
        const profile = await convex.query(api.profiles.get, {});
        if (profile) {
          if (profile.timezone) userTimezone = profile.timezone;
          const lines = [
            profile.displayName && `- Name: ${profile.displayName} (address them by name)`,
            profile.role && `- Role: ${profile.role}`,
            profile.company && `- Company: ${profile.company}`,
            profile.location && `- Location: ${profile.location}`,
            profile.timezone && `- Timezone: ${profile.timezone} (use for all times and scheduling)`,
            profile.communicationStyle &&
              `- Preferred communication style: ${profile.communicationStyle}`,
            profile.signOff && `- Email sign-off to use when sending email: "${profile.signOff}"`,
            profile.notes && `- Additional context: ${profile.notes}`,
          ].filter(Boolean);
          if (lines.length > 0) {
            profileSection = `\n\nOperator profile (treat as ground truth about the user):\n${lines.join("\n")}`;
          }
        }
      }
    } catch (err: any) {
      console.warn("[jarvis] Convex profile query warning (continuing with prompt):", err?.message || err);
    }
  }

  // 2. Parse request body
  let body: {
    message?: string;
    messages?: Array<{ role: "system" | "user" | "assistant" | "tool"; content?: string | null }>;
    userLocation?: { latitude: number; longitude: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date();
  const locationSection = body.userLocation
    ? `\nUser Current Device Location: Latitude ${body.userLocation.latitude}, Longitude ${body.userLocation.longitude}. When the user asks for places "near me", pass these coordinates into maps_search.`
    : "";

  let formattedDateContext = now.toISOString();
  try {
    formattedDateContext = new Intl.DateTimeFormat("en-US", {
      timeZone: userTimezone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now);
  } catch {
    formattedDateContext = now.toString();
  }

  const systemPrompt =
    JARVIS_INSTRUCTIONS +
    profileSection +
    locationSection +
    `\n\nCurrent date and time in user's timezone (${userTimezone}): ${formattedDateContext} (ISO: ${now.toISOString()}). User Timezone: ${userTimezone}. Current Year: ${now.getFullYear()}.
CRITICAL CALENDAR & TIMEZONE RULES:
- The user's timezone is ${userTimezone} (IST = Indian Standard Time = Asia/Kolkata, UTC+05:30).
- When the user mentions any time without a timezone, OR explicitly mentions "IST", interpret it in ${userTimezone}.
- When calling "create_calendar_event":
  * Pass start_datetime in local ISO format without UTC 'Z', e.g. "${now.getFullYear()}-11-15T15:00:00" for 3:00 PM.
  * Always pass timezone: "${userTimezone}".
  * Always ensure the year is specified (current year is ${now.getFullYear()}).
- When the user asks "Show my meetings today", "What meetings do I have tomorrow?", "Show my schedule for November 15", or "What is my next meeting?", call "get_calendar_events" with appropriate time bounds or inspect upcoming events.`;

  const groq = new Groq({ apiKey });

  // 3. Build messages array
  const conversationMessages: any[] = [{ role: "system", content: systemPrompt }];

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    for (const msg of body.messages) {
      if (msg.role === "user" || msg.role === "assistant") {
        conversationMessages.push({
          role: msg.role,
          content: msg.content ?? "",
        });
      }
    }
  }

  if (body.message) {
    conversationMessages.push({
      role: "user",
      content: body.message,
    });
  }

  const tools = getGroqTools();
  const executedTools: Array<{ name: string; args: any; result: any }> = [];

  // 4. Resolve candidate models
  const modelsToTry = cachedWorkingModel
    ? [cachedWorkingModel, ...CANDIDATE_MODELS.filter((m) => m !== cachedWorkingModel)]
    : CANDIDATE_MODELS;

  const MAX_TURNS = 6;
  let lastError = "None of the configured Groq models were accessible on your account.";

  for (const currentModel of modelsToTry) {
    try {
      let turn = 0;
      const workingMessages = [...conversationMessages];
      const executedTools: Array<{ name: string; args: any; result: any }> = [];

      while (turn < MAX_TURNS) {
        turn++;

        const completion = await groq.chat.completions.create({
          model: currentModel,
          messages: workingMessages,
          tools: tools as any,
          tool_choice: "auto",
          temperature: 0.6,
          max_tokens: 1024,
        });

        const choice = completion.choices[0];
        if (!choice || !choice.message) {
          throw new Error(`No response choice from Groq model ${currentModel}`);
        }

        const assistantMessage = choice.message;
        workingMessages.push({
          role: "assistant",
          content: assistantMessage.content ?? null,
          tool_calls: assistantMessage.tool_calls,
        });

        // Check if tool calls were requested
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          for (const toolCall of assistantMessage.tool_calls) {
            const fnName = toolCall.function.name;
            let fnArgs: any = {};
            try {
              fnArgs = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              fnArgs = {};
            }

            let toolResult: any;
            try {
              toolResult = await convex.action(api.tools.execute, {
                name: fnName,
                arguments: fnArgs,
              });
            } catch (err: any) {
              toolResult = {
                error: "execution_error",
                message: err instanceof Error ? err.message : String(err),
              };
            }

            executedTools.push({ name: fnName, args: fnArgs, result: toolResult });

            workingMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult ?? {}).slice(0, 30000),
            });
          }
          // Continue multi-turn loop with tool output
        } else {
          // Model completed successfully! Cache this model
          cachedWorkingModel = currentModel;
          const textResponse = assistantMessage.content || "";
          return NextResponse.json({
            response: textResponse,
            toolsExecuted: executedTools,
            model: currentModel,
          });
        }
      }

      cachedWorkingModel = currentModel;
      return NextResponse.json({
        response: "I have completed the operations, sir.",
        toolsExecuted: executedTools,
        model: currentModel,
      });
    } catch (err: any) {
      if (cachedWorkingModel === currentModel) {
        cachedWorkingModel = null;
      }
      let errMsg = err instanceof Error ? err.message : String(err);
      try {
        const jsonStart = errMsg.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(errMsg.slice(jsonStart));
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        }
      } catch {
        /* keep original */
      }
      lastError = errMsg;
      console.warn(`[jarvis] Groq model ${currentModel} failed (${errMsg}), trying next fallback...`);
      continue;
    }
  }

  console.error("[jarvis] All Groq candidate models failed. Last error:", lastError);
  return NextResponse.json(
    { error: lastError },
    { status: 500 }
  );
}
