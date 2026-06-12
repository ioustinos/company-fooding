import { BriefState, mergeBrief } from "./schema";

/** A multiple-choice prompt the agent emits so the UI can render option chips. */
export interface Ask {
  question: string;
  options: string[];
  multi?: boolean;
}

const MARKERS = ["<brief>", "<ask>"];

/** During streaming, the visible chat text is everything before the first machine block. */
export function visibleOf(raw: string): string {
  let cut = raw.length;
  for (const mk of MARKERS) {
    const i = raw.indexOf(mk);
    if (i >= 0) cut = Math.min(cut, i);
  }
  return raw.slice(0, cut).trimEnd();
}

/** Parse a completed assistant message into visible reply + brief state + optional choices. */
export function parseAssistant(raw: string): { visible: string; brief: BriefState | null; ask: Ask | null } {
  let brief: BriefState | null = null;
  let ask: Ask | null = null;

  const bm = raw.match(/<brief>([\s\S]*?)<\/brief>/i) || raw.match(/<brief>([\s\S]*)$/i);
  if (bm) {
    try {
      brief = mergeBrief(JSON.parse(bm[1].trim()));
    } catch {
      brief = null;
    }
  }

  const am = raw.match(/<ask>([\s\S]*?)<\/ask>/i) || raw.match(/<ask>([\s\S]*)$/i);
  if (am) {
    try {
      const a = JSON.parse(am[1].trim());
      if (a && typeof a.question === "string" && Array.isArray(a.options) && a.options.length) {
        ask = { question: a.question, options: a.options.map(String), multi: !!a.multi };
      }
    } catch {
      ask = null;
    }
  }

  return { visible: visibleOf(raw), brief, ask };
}

/** Split a completed assistant message into the visible reply + parsed brief state. */
export function splitBrief(raw: string): { visible: string; brief: BriefState | null } {
  let visible = raw;
  let jsonStr: string | null = null;

  const m = raw.match(/<brief>([\s\S]*?)<\/brief>/i);
  if (m) {
    jsonStr = m[1];
    visible = raw.replace(m[0], "").trim();
  } else {
    const open = raw.indexOf("<brief>");
    if (open >= 0) {
      jsonStr = raw.slice(open + "<brief>".length);
      visible = raw.slice(0, open).trim();
    }
  }

  let brief: BriefState | null = null;
  if (jsonStr) {
    try {
      brief = mergeBrief(JSON.parse(jsonStr.trim()));
    } catch {
      brief = null; // keep previous panel state on parse failure
    }
  }
  return { visible, brief };
}

/** Minimal, safe markdown -> HTML for the exported brief (headings, lists, bold, hr). */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(l)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>";
      continue;
    }
    closeList();
    if (/^###\s+/.test(l)) html += "<h3>" + inline(l.replace(/^###\s+/, "")) + "</h3>";
    else if (/^##\s+/.test(l)) html += "<h2>" + inline(l.replace(/^##\s+/, "")) + "</h2>";
    else if (/^#\s+/.test(l)) html += "<h1>" + inline(l.replace(/^#\s+/, "")) + "</h1>";
    else if (/^---+$/.test(l)) html += "<hr/>";
    else if (l === "") html += "";
    else html += "<p>" + inline(l) + "</p>";
  }
  closeList();
  return html;
}

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
