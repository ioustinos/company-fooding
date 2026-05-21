// netlify/functions/cf-explain.ts
//
// Proxy endpoint for the in-page chat agent in CF_FORECAST_SIMULATOR.html.
// Accepts { question, state } and forwards a single-turn message to the
// Anthropic API. Server-side so ANTHROPIC_API_KEY never leaves the function.
//
// Wire-up:
//   - Endpoint path: POST /api/cf-explain (via public/_redirects `/api/*` rule)
//   - Required env var (Netlify Site config): ANTHROPIC_API_KEY
//   - Default model: claude-haiku-4-5-20251001 (cheap + fast; override via
//     ANTHROPIC_MODEL env if you want Sonnet).

import type { Handler } from '@netlify/functions';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are an analyst embedded inside the Company Fooding (CF) forecast simulator. CF is a B2B corporate-feeding / meal-benefit platform targeting Attica, Greece. The simulator models acquisition, retention, revenue, costs, and valuation over a 12–60 month horizon. Your user is a CF founder or co-worker who is interrogating the model live in their browser.

You will receive on every turn:
1. The user's natural-language question.
2. A JSON snapshot of the simulator's current state — \`knobs\` (every configurable parameter), \`events\` (overrides scheduled at specific months or triggered by conditions), and \`monthsSample\` (computed monthly results sampled at M1, M3, M6, M12, M18, M24, M30, M36).

Your job: answer concretely with reference to the user's actual numbers. Cite specific values from the snapshot when relevant (e.g. "at M14 the effective close-rate is 8.2% because penetration has reached 18% and β = 13 in the saturation formula"). Explain the math/mechanism behind any pattern the user is asking about. When useful, suggest a specific knob the user could tweak to test their hypothesis ("set Cold-start ramp to 0 and watch what happens to the M1–M6 close-rate"). Be honest about uncertainty or model limitations.

Tone: peer-to-peer, no hype, no fluff. Keep responses under 250 words unless the user explicitly asks for depth.

Key mechanics in the simulator (so you can reason about cause and effect):
- Marketing budget → paid leads (spend ÷ CPL × seasonality multiplier) + referral leads (active customers × coefficient) = total leads.
- Leads × effective close-rate (= base × cold-start ramp × saturation curve 1/(1+β·penetration·10)) = deals, closing \`salesCycleMonths\` later.
- New companies join cohorts. Each cohort gets honeymoon (no churn for first N months), then early-churn band (× multiplier for next M months), then steady-state churn. Effective churn rate visible per month is a blend across cohorts.
- Revenue: company subs (base + per-employee × avg size) + vendor subs + commission on GMV (split meals/extras/catering) + service fees. Delivery is ISOLATED from revenue/cost (pass-through, zero net by design).
- Variable cost-to-serve per customer = (ops salaries + tech infra cost) ÷ active companies. Contribution margin = ARPC − variable cost-to-serve. Margin-LTV = contribution margin × customer lifetime (1/churn). LTV:CAC uses margin-LTV.
- Valuation = annualised profit × profit-multiple OR annualised revenue × revenue-multiple, depending on \`valuationMode\` knob.
- Cash & runway: cash balance = \`startingCash\` + cumulative profit + cumulative injections (v1 treats profit as cash, no DSO/DPO timing lag). Runway = first month cash balance goes negative (out of money). Minimum raise to survive = the lowest cash balance reached (the trough), if negative. Funding rounds/grants/loans are modelled via events that override the \`cashInjection\` metric in a specific month (duration = 1 month, absolute value = the amount).
- SAM = 460K Attica employees (private firms with 5+ employees, derived from ELSTAT Q4 2024 LFS). Growth capped at SAM.
- Default scenario: 6 starting companies (seed at M1), 230 work days/year, 60% participation, €9 meal, 2.5% steady-state churn, 6-month honeymoon.

If a question is outside the scope of this simulator (e.g. "what should our company name be?"), say so briefly and steer the user back to model-related questions.`;

interface RequestBody {
  question?: string;
  state?: {
    knobs?: Record<string, number>;
    events?: unknown[];
    months?: Array<Record<string, number>>;
  };
}

export const handler: Handler = async (event) => {
  // CORS / preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY env var is not configured on this Netlify site.',
      }),
    };
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }

  const question = (body.question || '').trim();
  if (!question) {
    return { statusCode: 400, body: 'Missing "question"' };
  }
  if (question.length > 4000) {
    return { statusCode: 400, body: 'Question too long (max 4000 chars)' };
  }

  // Compact the snapshot — keep knobs + events full, but only sample months at key
  // intervals to control token cost. Claude rarely needs every month to reason.
  const state = body.state || {};
  const sampleMonths = [1, 3, 6, 9, 12, 18, 24, 30, 36];
  const monthsSample = Array.isArray(state.months)
    ? sampleMonths
        .map((m) => (state.months as Array<Record<string, number>>).find((x) => x.month === m))
        .filter(Boolean)
    : [];
  const compactState = {
    knobs: state.knobs || {},
    events: state.events || [],
    monthsSample,
  };

  const userMessage = `Current simulator state (knobs, events, sampled monthly results):
\`\`\`json
${JSON.stringify(compactState, null, 2)}
\`\`\`

My question: ${question}`;

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return {
        statusCode: apiRes.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Anthropic API call failed',
          status: apiRes.status,
          detail: errText.slice(0, 500),
        }),
      };
    }

    const data = (await apiRes.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const answer = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
      .trim();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        answer,
        model,
        usage: data.usage || null,
      }),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Upstream fetch failed', detail: msg }),
    };
  }
};
