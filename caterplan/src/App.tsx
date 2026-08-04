import { useEffect, useRef, useState } from "react";
import { parseAssistant, visibleOf, mdToHtml, type Ask } from "./lib/brief";
import { useSessionStore, type Msg, type Attachment, type LeadData } from "./store/useSessionStore";
import { SURVEY } from "./lib/survey";

/** Build the Anthropic messages array, expanding any attachment into content blocks. */
function buildApiMessages(msgs: Msg[]) {
  const out: { role: string; content: unknown }[] = [];
  for (const m of msgs) {
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.text });
      continue;
    }
    if (m.attachment) {
      const a = m.attachment;
      const blocks: unknown[] = [];
      if (a.kind === "image" && a.data) blocks.push({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } });
      else if (a.kind === "document" && a.data) blocks.push({ type: "document", source: { type: "base64", media_type: a.mediaType, data: a.data } });
      else if (a.kind === "text" && a.data) blocks.push({ type: "text", text: `Attached file "${a.name}":\n\n${a.data}` });
      else blocks.push({ type: "text", text: `(file previously attached: ${a.name})` });
      blocks.push({ type: "text", text: m.text || "Please use the attached file for the brief." });
      out.push({ role: "user", content: blocks });
    } else {
      out.push({ role: "user", content: m.text });
    }
  }
  const first = out.findIndex((x) => x.role === "user");
  return first < 0 ? [] : out.slice(first);
}

const MODELS: { id: string; label: string }[] = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

// Slots shown in the locked (pre-survey) teaser — the at-a-glance. Everything
// else is blurred until the user completes the unlock survey.
const TEASER = new Set(["A|Occasion", "B|Date(s)", "C|Number of guests"]);
const isTeaser = (secId: string, label: string) => TEASER.has(secId + "|" + label);

// Owner-controlled gate. OFF by default — everyone gets the full brief + PDF.
// To turn the lead-gen lock ON: set the Netlify env var VITE_CATERPLAN_LOCK="on"
// and redeploy. Set it to anything else (or remove it) to turn the lock off.
const LOCK_ENABLED = import.meta.env.VITE_CATERPLAN_LOCK === "on";

export default function App() {
  const messages = useSessionStore((s) => s.messages);
  const setMessages = useSessionStore((s) => s.setMessages);
  const brief = useSessionStore((s) => s.brief);
  const setBrief = useSessionStore((s) => s.setBrief);
  const resetSession = useSessionStore((s) => s.reset);
  const unlocked = useSessionStore((s) => s.unlocked);
  const setUnlocked = useSessionStore((s) => s.setUnlocked);
  const gated = LOCK_ENABLED && !unlocked; // true only when the owner lock is on AND not yet unlocked
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [panelHidden, setPanelHidden] = useState(false);
  const [input, setInput] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ name: "", email: "", company: "" });
  const [submitting, setSubmitting] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("That file is over 5MB — please attach something smaller.");
      return;
    }
    const isImg = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf";
    const isText = f.type.startsWith("text/") || /\.(md|csv|json|txt)$/i.test(f.name);
    if (isImg || isPdf) {
      const r = new FileReader();
      r.onload = () => {
        const base64 = String(r.result).split(",")[1] || "";
        setAttachment({ kind: isImg ? "image" : "document", name: f.name, mediaType: f.type, data: base64 });
      };
      r.readAsDataURL(f);
    } else if (isText) {
      const r = new FileReader();
      r.onload = () => setAttachment({ kind: "text", name: f.name, data: String(r.result || "") });
      r.readAsText(f);
    } else {
      setError("Unsupported file type — attach an image, PDF, or text/CSV/MD file.");
    }
  }

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Persistence is handled by the Zustand `persist` middleware (localStorage) — no manual save needed.

  function clearSession() {
    resetSession();
    setAsk(null);
    setPicked([]);
    setAttachment(null);
    setError(null);
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    const att = textOverride === undefined ? attachment : null;
    if ((!text && !att) || busy) return;
    if (textOverride === undefined) {
      setInput("");
      setAttachment(null);
      if (taRef.current) taRef.current.style.height = "auto";
    }
    setAsk(null);
    setPicked([]);
    setError(null);

    const next: Msg[] = [...messages, { role: "user", text, attachment: att ?? undefined }];
    setMessages(next);
    setBusy(true);
    setStreaming("");

    // Expand attachments into content blocks; start at the first user turn.
    const apiMessages = buildApiMessages(next);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        throw new Error(t || `Server error ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setStreaming(visibleOf(full));
      }
      const { visible, brief: parsed, ask: nextAsk } = parseAssistant(full);
      setMessages((m) => [...m, { role: "assistant", text: visible || "…" }]);
      if (parsed) setBrief(parsed);
      setAsk(nextAsk);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
      setBusy(false);
      taRef.current?.focus();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onPick(opt: string) {
    if (busy) return;
    if (ask?.multi) {
      setPicked((p) => (p.includes(opt) ? p.filter((x) => x !== opt) : [...p, opt]));
    } else {
      send(opt);
    }
  }
  function onSomethingElse() {
    setAsk(null);
    setPicked([]);
    taRef.current?.focus();
  }

  function setSlot(sectionId: string, label: string, status: "confirmed" | "assumed" | "gap") {
    setBrief((b) => ({
      ...b,
      sections: b.sections.map((sec) =>
        sec.id !== sectionId
          ? sec
          : { ...sec, slots: sec.slots.map((sl) => (sl.label !== label ? sl : { ...sl, status })) }
      ),
    }));
  }

  function confirmAssumption(sectionId: string, label: string, value: string) {
    if (busy) return;
    setSlot(sectionId, label, "confirmed"); // optimistic; agent re-confirms on its reply
    send(`Confirm this assumption as correct — ${label}: ${value}`);
  }

  function editAssumption(label: string, value: string) {
    const text = `${label}: ${value}`;
    setInput(text);
    setTimeout(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 240) + "px";
      el.selectionStart = el.selectionEnd = text.length;
    }, 0);
  }

  function exportPdf() {
    if (gated) {
      setShowSurvey(true);
      return;
    }
    if (!brief.finalBriefMarkdown) return;
    const area = document.getElementById("print-area");
    if (area) area.innerHTML = mdToHtml(brief.finalBriefMarkdown);
    window.print();
  }

  async function submitSurvey() {
    for (const q of SURVEY) {
      if (q.required && !answers[q.id]) {
        setSurveyError("Please answer every question.");
        return;
      }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) {
      setSurveyError("Enter a valid work email.");
      return;
    }
    if (!contact.company.trim()) {
      setSurveyError("Enter your company name.");
      return;
    }
    setSurveyError(null);
    setSubmitting(true);
    const lead: LeadData = {
      answers,
      contact: { name: contact.name.trim(), email: contact.email.trim(), company: contact.company.trim() },
      at: new Date().toISOString(),
    };
    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...lead, brief: { readiness: brief.readiness } }),
      });
    } catch {
      /* don't block the unlock on the lead stub */
    }
    setUnlocked(lead); // persists; reveals full brief + enables export
    setSubmitting(false);
    setShowSurvey(false);
  }

  const { requiredMet, requiredTotal, completeness } = brief.readiness;
  const gateGreen = requiredMet >= requiredTotal;
  const exportReady = brief.done && !!brief.finalBriefMarkdown;

  return (
    <>
      <header>
        <div className="logo">
          <span className="dot">◔</span>
          <div>
            Caterplan <small>Event Brief Builder · by Orexis</small>
          </div>
        </div>
        <div className="spacer" />
        <span className="pill">
          Required <b>{requiredMet}</b>/{requiredTotal} · <b>{completeness}</b>%
        </span>
        <select className="modelSel" value={model} onChange={(e) => setModel(e.target.value)} title="Model">
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button className="hbtn" onClick={() => setPanelHidden((v) => !v)}>
          {panelHidden ? "Show brief" : "Hide brief"}
        </button>
        <button className="hbtn" onClick={clearSession} title="Start a new brief (clears the saved session)">
          New
        </button>
      </header>

      <main className={panelHidden ? "panel-hidden" : ""}>
        <section className="chat">
          <div className="stream" ref={streamRef}>
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} attachment={m.attachment} />
            ))}
            {streaming !== null && (
              <div className="msg assistant">
                <div className="who">C</div>
                <div className="bubble">
                  {streaming}
                  <span className="cursor" />
                </div>
              </div>
            )}
            {error && <div className="err">⚠ {error}</div>}
          </div>

          {ask && !busy && (
            <div className="asks">
              <div className="asks-q">{ask.question}</div>
              <div className="asks-row">
                {ask.options.map((opt) => (
                  <button
                    key={opt}
                    className={"chip" + (ask.multi && picked.includes(opt) ? " on" : "")}
                    onClick={() => onPick(opt)}
                  >
                    {opt}
                  </button>
                ))}
                {ask.multi && picked.length > 0 && (
                  <button className="chip send-sel" onClick={() => send(picked.join(", "))}>
                    Send {picked.length} →
                  </button>
                )}
                <button className="chip ghost" onClick={onSomethingElse}>
                  Something else…
                </button>
              </div>
            </div>
          )}

          <div className="composer">
            {attachment && (
              <div className="attach-chip">
                <span>📎 {attachment.name}</span>
                <button onClick={() => setAttachment(null)} title="Remove">
                  ×
                </button>
              </div>
            )}
            <div className="wrap">
              <button className="attach-btn" title="Attach a file" onClick={() => fileRef.current?.click()}>
                📎
              </button>
              <textarea
                ref={taRef}
                rows={1}
                placeholder="Describe your event… e.g. ‘Team workshop for ~50 people next month, casual but a bit elevated’"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 240) + "px";
                }}
                onKeyDown={onKey}
              />
              <button className="send" onClick={() => send()} disabled={busy || (!input.trim() && !attachment)}>
                Send
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/*,application/pdf,text/plain,text/csv,text/markdown,.md,.csv,.json,.txt"
              onChange={onFile}
            />
            <div className="hint">
              {MODELS.find((m) => m.id === model)?.label} · Enter to send, Shift+Enter for a new line · 📎 attach an image, PDF, or text file
            </div>
          </div>
        </section>

        <aside className="panel">
          <div className="panel-head">
            <h2>Live brief</h2>
            <p>
              Fills in as you talk.{" "}
              <b>
                {gateGreen
                  ? "All required fields captured."
                  : `${requiredTotal - requiredMet} required field${requiredTotal - requiredMet === 1 ? "" : "s"} to go.`}
              </b>
            </p>
            <div className="meter">
              <div className="row">
                <span>Completeness</span>
                <span>{completeness}%</span>
              </div>
              <div className="bar">
                <span style={{ width: completeness + "%" }} />
              </div>
              <div className={"gate" + (gateGreen ? " green" : "")}>
                <span className="led" />
                <span>
                  {brief.done
                    ? "Brief complete — ready to send to caterers"
                    : `${requiredMet} / ${requiredTotal} must-haves captured`}
                </span>
              </div>
            </div>
            {gated && (
              <button className="lock-banner" onClick={() => setShowSurvey(true)}>
                <span className="lock-ico">🔒</span>
                <span>
                  <b>Full brief locked.</b> Answer 4 quick questions to reveal every detail and unlock the PDF for your caterers.
                </span>
                <span className="lock-cta">Unlock →</span>
              </button>
            )}
          </div>

          <div className="sections">
            {brief.sections.map((sec, idx) => {
              const total = sec.slots.length;
              const filled = sec.slots.filter((s) => s.status !== "gap" && s.value).length;
              const pillCls = filled === 0 ? "pill-empty" : filled >= total ? "pill-full" : "pill-partial";
              return (
                <details className="sec" key={sec.id} open={idx < 2}>
                  <summary>
                    <span className="chev">▸</span>
                    {sec.title}
                    <span className={"tag " + pillCls}>
                      {filled}/{total}
                    </span>
                  </summary>
                  <div className="body">
                    {sec.slots.map((s) => {
                      const locked = gated && !isTeaser(sec.id, s.label) && s.status !== "gap" && !!s.value;
                      return (
                        <div className={"slot " + s.status} key={s.label}>
                          <span className="led" />
                          <span className="k">{s.label}</span>
                          <span className={"v" + (locked ? " locked" : "")}>{s.value || "still needed"}</span>
                          {!locked && s.status === "assumed" && (
                            <span className="slot-actions">
                              <button
                                className="sa-btn ok"
                                title="Confirm this assumption"
                                disabled={busy}
                                onClick={() => confirmAssumption(sec.id, s.label, s.value)}
                              >
                                ✓
                              </button>
                              <button
                                className="sa-btn edit"
                                title="Edit this assumption"
                                onClick={() => editAssumption(s.label, s.value)}
                              >
                                ✎
                              </button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

          <div className="panel-foot">
            {gated ? (
              <button className="export unlock" onClick={() => setShowSurvey(true)}>
                🔒 Unlock full brief + PDF
              </button>
            ) : (
              <button className="export" onClick={exportPdf} disabled={!exportReady}>
                Export brief (PDF)
              </button>
            )}
            <div className="legend">
              <span>
                <i style={{ background: "var(--ok)" }} />
                confirmed
              </span>
              <span>
                <i style={{ background: "var(--amber)" }} />
                assumed
              </span>
              <span>
                <i style={{ background: "var(--gap)" }} />
                still needed
              </span>
            </div>
          </div>

          <div className="rail">
            <div className="ring">
              {requiredMet}/{requiredTotal}
            </div>
            <div className="vlabel">LIVE BRIEF</div>
          </div>
        </aside>
      </main>

      {showSurvey && (
        <div className="modal-overlay" onClick={() => !submitting && setShowSurvey(false)}>
          <div className="survey" onClick={(e) => e.stopPropagation()}>
            <button className="survey-x" onClick={() => setShowSurvey(false)} disabled={submitting} title="Close">
              ×
            </button>
            <h3>Unlock your full brief</h3>
            <p className="survey-sub">
              Four quick questions about how your team eats — then the full brief and the PDF for your caterers are yours.
            </p>

            {SURVEY.map((q) => (
              <div className="q" key={q.id}>
                <div className="q-label">{q.question}</div>
                <div className="q-opts">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      className={"q-opt" + (answers[q.id] === opt ? " on" : "")}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="q">
              <div className="q-label">Where should we send it?</div>
              <div className="contact">
                <input placeholder="Full name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <input placeholder="Work email *" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                <input placeholder="Company *" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} />
              </div>
            </div>

            {surveyError && <div className="survey-err">⚠ {surveyError}</div>}

            <button className="survey-submit" onClick={submitSurvey} disabled={submitting}>
              {submitting ? "Unlocking…" : "Unlock full brief"}
            </button>
            <div className="survey-fine">No spam — this helps Orexis tailor food options for your team.</div>
          </div>
        </div>
      )}

      <div id="print-area" />
    </>
  );
}

function escHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function inlineMd(s: string) {
  return escHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
/** Split an assistant reply into styled blocks: question header, assumption callout, or plain line. */
function formatBubble(text: string): { cls: string; html: string }[] {
  const blocks: { cls: string; html: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let cls = "ln";
    if (/^(assuming|i['’]?ll assume|i['’]?m assuming|assumption|assumed|defaulting)\b/i.test(line)) cls = "bubble-assume";
    else if (/\?\s*$/.test(line)) cls = "bubble-q";
    blocks.push({ cls, html: inlineMd(line) });
  }
  if (!blocks.length) blocks.push({ cls: "ln", html: inlineMd(text) });
  return blocks;
}

function Bubble({ role, text, attachment }: { role: "user" | "assistant"; text: string; attachment?: Attachment }) {
  const blocks = role === "assistant" ? formatBubble(text) : null;
  return (
    <div className={"msg " + role}>
      <div className="who">{role === "assistant" ? "C" : "Y"}</div>
      <div className="bubble">
        {attachment && <div className="bubble-file">📎 {attachment.name}</div>}
        {blocks ? blocks.map((b, i) => <div key={i} className={b.cls} dangerouslySetInnerHTML={{ __html: b.html }} />) : text}
      </div>
    </div>
  );
}
