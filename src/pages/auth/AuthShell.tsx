// Shared 2-column auth shell — matches the orexi spec `page_login` layout.
// Left: branded panel with the plate + tagline. Right: the form area passed
// as children. Used by LoginPage, ForgotPasswordPage, ResetPasswordPage.

import type { ReactNode } from 'react'
import { useUIStore } from '../../store/useUIStore'

export default function AuthShell({ children }: { children: ReactNode }) {
  const { lang, setLang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  return (
    <section className="min-h-screen grid lg:grid-cols-2">
      {/* Branded left panel — hidden on mobile so the form gets full width */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand text-white relative overflow-hidden">
        <div className="absolute -right-24 -bottom-24 w-[480px] h-[480px] rounded-full border-[32px] border-white/10"></div>
        <div className="absolute -right-8 -bottom-8 w-[200px] h-[200px] rounded-full bg-accent/90"></div>
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="13" stroke="white" strokeWidth="2" />
              <circle cx="16" cy="16" r="5.5" fill="#D97948" />
            </svg>
            <span className="font-display text-[26px] font-semibold tracking-tight">orexi</span>
          </div>
        </div>
        <div className="relative max-w-md">
          <div className="font-display italic text-[28px] leading-[36px] mb-5 opacity-90">
            {L('"Καλή όρεξη" — ο πιο παλιός B2B τομέας στην Ελλάδα, πια ψηφιακός.',
               "\"Bon appétit\" — Greece’s oldest B2B category, finally digital.")}
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-white/70 font-mono">
            <span>EU-hosted</span><span className="opacity-40">•</span>
            <span>GDPR-first</span><span className="opacity-40">•</span>
            <span>GR-invoicing</span>
          </div>
        </div>
      </div>

      {/* Right form area */}
      <div className="flex flex-col items-center justify-center p-8 lg:p-16 bg-bg">
        {/* lang toggle floating top-right on the form side */}
        <div className="self-end mb-8 lg:mb-0 lg:absolute lg:top-6 lg:right-8 flex items-center bg-surface rounded-sm p-0.5 border border-line">
          {(['el', 'en'] as const).map((c) => (
            <button key={c} onClick={() => setLang(c)}
              className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] rounded-xs transition ${lang === c ? 'bg-bg shadow-sm text-ink' : 'text-ink-faint hover:text-ink'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </section>
  )
}
