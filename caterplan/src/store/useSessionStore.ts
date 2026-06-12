import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BriefState, emptyBrief } from "../lib/schema";

export type Attachment =
  | { kind: "image"; name: string; mediaType: string; data: string }
  | { kind: "document"; name: string; mediaType: string; data: string }
  | { kind: "text"; name: string; data: string };

export type Msg = { role: "user" | "assistant"; text: string; attachment?: Attachment };

export const OPENING =
  "Hi — I'm here to turn your event into a brief our caterers can quote on. Tell me about it: what's the occasion, roughly when, how many people, and what you're picturing food-wise? Just describe it in your own words and I'll shape it from there.";

const freshMessages = (): Msg[] => [{ role: "assistant", text: OPENING }];

type Updater<T> = T | ((prev: T) => T);
const apply = <T,>(u: Updater<T>, prev: T): T => (typeof u === "function" ? (u as (p: T) => T)(prev) : u);

type SessionState = {
  messages: Msg[];
  brief: BriefState;
  setMessages: (u: Updater<Msg[]>) => void;
  setBrief: (u: Updater<BriefState>) => void;
  reset: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      messages: freshMessages(),
      brief: emptyBrief(),
      setMessages: (u) => set((s) => ({ messages: apply(u, s.messages) })),
      setBrief: (u) => set((s) => ({ brief: apply(u, s.brief) })),
      reset: () => set({ messages: freshMessages(), brief: emptyBrief() }),
    }),
    {
      name: "caterplan-session-v1",
      version: 1,
      // Persist only the data, and strip heavy attachment payloads (base64) to stay
      // well under the localStorage quota — restored chats keep the file name as a chip.
      partialize: (s) => ({
        messages: s.messages.map((m) =>
          m.attachment ? { ...m, attachment: { ...m.attachment, data: "" } } : m
        ),
        brief: s.brief,
      }),
    }
  )
);
