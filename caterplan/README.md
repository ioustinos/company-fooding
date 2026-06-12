# Orexis Event Builder

Isolated, auth-free web app: a company describes a corporate event in free text, an
AI agent interviews them (adaptive, one question at a time, with tuned alternatives),
and a live **vendor-neutral catering brief** builds in the side panel — exportable to
PDF for multi-vendor bidding.

Stack mirrors Company Fooding: **React 19 + TypeScript + Vite + Netlify Functions**.
No database, no auth. The agent's brain is the Orexis interviewer skill, loaded as the
system prompt (`netlify/functions/system-prompt.txt`).

## Architecture
- `src/` — React app (chat + live brief panel + PDF export). Talks only to `/api/chat`.
- `netlify/functions/orexis-chat.mts` — **streaming** proxy to the Anthropic Messages
  API. Holds the API key server-side (env `ANTHROPIC_API_KEY`), reads the system prompt,
  and re-streams text deltas to the browser as Server-Sent text.
- `netlify/functions/system-prompt.txt` — the interviewer skill + the app's `<brief>`
  JSON output contract. Single source of the agent's behaviour.
- Default model: **Claude Sonnet 4.6** (switchable in the header; Opus 4.8 / Haiku 4.5).

## Deploy (one command)
On a machine logged into Netlify:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
./deploy.sh
```
This builds, creates an isolated site (`orexis-event-builder` by default — override with
`SITE_NAME=…`), sets the key, and deploys to production. The URL is printed at the end.

### Manual equivalent
```bash
npm install
npm run build
npx netlify-cli login
npx netlify-cli sites:create --name orexis-event-builder
npx netlify-cli link --name orexis-event-builder
npx netlify-cli env:set ANTHROPIC_API_KEY sk-ant-...
npx netlify-cli deploy --build --prod
```

## Local dev
```bash
npm install
npx netlify-cli dev      # serves the app AND the /api/chat function at :8888
```
(`npm run dev` alone runs only the Vite front-end — the chat needs the function, so use
`netlify dev`.) Set `ANTHROPIC_API_KEY` in your shell or a `.env` first.

## Security notes (auth-free, by design)
- The endpoint is public and unguarded. Anyone with the URL can spend tokens.
  **Set a monthly spend cap** on the Anthropic key (console → Limits) while it's open.
- To add a light guard later: a per-IP rate limit or a shared client token in
  `orexis-chat.mts` is a ~20-line change. Hook is noted in the function.
- The API key never reaches the browser — only the function holds it.
