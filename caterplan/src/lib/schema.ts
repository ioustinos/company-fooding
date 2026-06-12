export type SlotStatus = "gap" | "assumed" | "confirmed";

export interface BriefSlot {
  label: string;
  value: string;
  status: SlotStatus;
}
export interface BriefSection {
  id: string;
  title: string;
  slots: BriefSlot[];
}
export interface Readiness {
  requiredMet: number;
  requiredTotal: number;
  completeness: number;
}
export interface BriefState {
  readiness: Readiness;
  sections: BriefSection[];
  done: boolean;
  finalBriefMarkdown: string | null;
}

/** Section + slot skeleton — mirrors the interviewer skill's brief schema. */
export const SKELETON: { id: string; title: string; labels: string[] }[] = [
  { id: "A", title: "Event identity", labels: ["Occasion", "Purpose & tone", "Host company & sector", "Cadence"] },
  { id: "B", title: "Timing", labels: ["Date(s)", "Start & end time", "Date flexibility", "Lead time"] },
  { id: "C", title: "Headcount", labels: ["Number of guests", "Confirmation date", "Audience mix"] },
  { id: "D", title: "Venue & logistics", labels: ["Location", "Space type", "On-site facilities", "Access & delivery", "Setup & teardown", "Furniture/power"] },
  { id: "E", title: "Service & staffing", labels: ["Service format", "Guest selection model", "Selection channel & deadline", "Staffing & service level", "Cutlery & napkins", "Tables & linen", "Dish labelling / tags", "Packaging & containers", "Tableware (plates/cups)", "Cleanup & waste"] },
  { id: "F", title: "Menu & food", labels: ["Cuisine / theme", "Structure", "Must-haves / avoids", "Quality tier", "Sourcing standards"] },
  { id: "G", title: "Beverages", labels: ["Non-alcoholic", "Alcohol", "Bar service"] },
  { id: "H", title: "Dietary & compliance", labels: ["Dietary counts", "Allergen labelling", "Certifications / insurance"] },
  { id: "I", title: "Budget", labels: ["Budget", "What's included", "Flexibility"] },
  { id: "J", title: "Experience extras", labels: ["Branding", "Theme / aesthetic", "Set-piece moments", "Sustainability extras"] },
  { id: "K", title: "Decision & admin", labels: ["Offer deadline", "Decision date", "Evaluation criteria", "Vendors invited", "Proposal format", "Contact", "Invoicing entity / PO"] },
];

export function emptyBrief(): BriefState {
  return {
    readiness: { requiredMet: 0, requiredTotal: 10, completeness: 0 },
    sections: SKELETON.map((s) => ({
      id: s.id,
      title: s.title,
      slots: s.labels.map((label) => ({ label, value: "", status: "gap" as SlotStatus })),
    })),
    done: false,
    finalBriefMarkdown: null,
  };
}

/** Merge a model-emitted brief onto the full skeleton so the panel never loses sections. */
export function mergeBrief(incoming: Partial<BriefState> | null): BriefState {
  const base = emptyBrief();
  if (!incoming) return base;
  if (incoming.readiness) base.readiness = { ...base.readiness, ...incoming.readiness };
  if (Array.isArray(incoming.sections)) {
    for (const inSec of incoming.sections) {
      const sec = base.sections.find((s) => s.id === inSec.id);
      if (!sec || !Array.isArray(inSec.slots)) continue;
      for (const inSlot of inSec.slots) {
        const slot = sec.slots.find((sl) => sl.label === inSlot.label);
        if (slot) {
          slot.value = inSlot.value ?? "";
          slot.status = (inSlot.status as SlotStatus) ?? "gap";
        }
      }
    }
  }
  base.done = !!incoming.done;
  base.finalBriefMarkdown = incoming.finalBriefMarkdown ?? null;
  return base;
}
