import type { Config, Context } from "@netlify/functions";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED = new Set(["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"]);
const DEFAULT_MODEL = "claude-sonnet-4-6";

// System prompt = the Orexis interviewer skill. Read once at cold start.
let SYSTEM_PROMPT: string | null = null;
function systemPrompt(): string {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT;
  const candidates = [
    fileURLToPath(new URL("./system-prompt.txt", import.meta.url)),
    fileURLToPath(new URL("../../netlify/functions/system-prompt.txt", import.meta.url)),
    new URL("netlify/functions/system-prompt.txt", `file://${process.cwd()}/`).pathname,
    `${process.cwd()}/netlify/functions/system-prompt.txt`,
  ];
  for (const p of candidates) {
    try {
      SYSTEM_PROMPT = readFileSync(p, "utf8");
      return SYSTEM_PROMPT;
    } catch {
      /* try next */
    }
  }
  throw new Error("system-prompt.txt could not be located");
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const key = Netlify.env.get("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response("Server missing ANTHROPIC_API_KEY", { status: 500 });

  let body: { messages?: unknown; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages[] is required", { status: 400 });
  }
  const model = body.model && ALLOWED.has(body.model) ? body.model : DEFAULT_MODEL;

  let system: string;
  try {
    system = systemPrompt();
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      // Mark the (identical-every-turn) system prompt as cacheable. Anthropic caches it
      // for ~5 min; subsequent turns read it at ~10% of the input-token price instead of
      // re-billing the whole skill each message.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      stream: true,
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "Anthropic API error");
    return new Response(errText, { status: upstream.status || 502 });
  }

  // Transform Anthropic SSE -> raw text deltas (what the browser appends).
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += dec.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
            controller.enqueue(enc.encode(j.delta.text));
          }
        } catch {
          /* ignore keep-alive / non-JSON lines */
        }
      }
    },
  });

  return new Response(upstream.body.pipeThrough(transform), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

export const config: Config = { path: "/api/chat" };
