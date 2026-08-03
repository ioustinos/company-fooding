import type { Config, Context } from "@netlify/functions";

// Caterplan lead capture — receives the unlock-survey payload (Company Fooding
// needs + contact) and is the single hook point to forward a warm lead onward.
//
// For now it validates + logs and returns ok. When ready, wire the TODO below to
// push the lead to Klaviyo (create profile + add to a "Caterplan leads" list) or
// email it — nothing else in the app needs to change.

type LeadPayload = {
  answers?: Record<string, unknown>;
  contact?: { name?: string; email?: string; company?: string };
  brief?: unknown;
  at?: string;
};

export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: LeadPayload;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const email = body.contact?.email?.trim() ?? "";
  const company = body.contact?.company?.trim() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !company) {
    return json(400, { error: "email and company are required" });
  }

  // Structured log — visible in Netlify function logs until a destination is wired.
  console.log("[caterplan-lead]", JSON.stringify({
    at: body.at ?? new Date().toISOString(),
    contact: { name: body.contact?.name ?? "", email, company },
    answers: body.answers ?? {},
  }));

  // TODO: forward the lead when ready, e.g.
  //   - Klaviyo: create/update profile (email, company, properties=answers) + add to a "Caterplan leads" list
  //   - or email the lead to sales
  // The key would come from an env var (e.g. KLAVIYO_PRIVATE_KEY); the browser never sees it.

  return json(200, { ok: true });
};

function json(statusCode: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = { path: "/api/lead" };
