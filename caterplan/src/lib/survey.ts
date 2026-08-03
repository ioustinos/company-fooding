// Unlock survey — Company Fooding needs → warm Orexis lead.
//
// PLACEHOLDER CONTENT: swap these questions freely when the real ones land.
// The mechanism (gate, unlock, lead POST) doesn't care what the questions are —
// it just renders this array and collects answers by `id`. The contact step
// (name / work email / company) is separate and always stays.

export type SurveyQuestion = {
  id: string;
  question: string;
  type: "single" | "multi";
  options: string[];
  required?: boolean;
};

export const SURVEY: SurveyQuestion[] = [
  {
    id: "intent",
    question: "What brings you to Caterplan today?",
    type: "single",
    options: ["A one-off event", "Recurring team meals", "Just exploring"],
    required: true,
  },
  {
    id: "today",
    question: "How does your team eat at work today?",
    type: "single",
    options: ["Nothing organized", "Occasional catering", "A daily meal benefit / allowance", "In-house canteen"],
    required: true,
  },
  {
    id: "size",
    question: "Roughly how many people would this cover?",
    type: "single",
    options: ["Under 25", "25–75", "75–200", "200+"],
    required: true,
  },
  {
    id: "daily",
    question: "Interested in a daily food benefit for your team (the Orexis platform)?",
    type: "single",
    options: ["Yes — tell me more", "Maybe later", "No — just events"],
    required: true,
  },
];
