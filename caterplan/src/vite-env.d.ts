/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Owner gate: "on" enables the lead-gen lock; anything else = off. */
  readonly VITE_CATERPLAN_LOCK?: string;
}
