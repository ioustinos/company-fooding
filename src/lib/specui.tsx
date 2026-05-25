// orexi design-system primitives, ported faithfully from public/spec/index.html
// to React. These are the building blocks every company-facing screen is made
// of: icons, money formatting, Pill, Btn, KPI, FormSection, Field, RadioCard,
// Sparkbars, activity icons. Keep visual parity with the spec — class strings
// are copied verbatim where possible.

import type { ReactNode } from 'react'

/* ---------- money ---------- */
// Spec renders amounts from cents. `money` = compact (no decimals when round),
// `moneyFull` = always two decimals. Both use the .num (tabular mono) class at
// the call site.
export function moneyFull(cents: number, lang: 'el' | 'en' = 'el'): string {
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100)
}
export function money(cents: number, lang: 'el' | 'en' = 'el'): string {
  const v = (cents || 0) / 100
  const round = Number.isInteger(v)
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: round ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v)
}

/* ---------- icons ---------- */
// Inner SVG markup copied from the spec's `icons` map. Rendered through one
// <Icon> component so stroke/size stay consistent.
const ICON_PATHS: Record<string, string> = {
  home: '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M16 12h2"/><path d="M3 9h18"/>',
  history: '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  shop: '<path d="M4 8l1-4h14l1 4v1a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 10v10h14V10"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M21 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-7"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  office: '<path d="M3 21V5a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M15 9h4a2 2 0 012 2v10"/><path d="M7 7h2M7 11h2M7 15h2M15 13h2M15 17h2"/>',
  handshake: '<path d="M11 17l-2 2a1.5 1.5 0 11-2-2l4-4"/><path d="M13 11l4 4a1.5 1.5 0 102-2l-5-5-4 1-3-3-4 4 3 3"/><path d="M11 9l4-4 3 3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>',
  chevron_r: '<polyline points="9 18 15 12 9 6"/>',
  chevron_d: '<polyline points="6 9 12 15 18 9"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 004 0"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
}

export type IconName = keyof typeof ICON_PATHS
const ICON_SIZE: Partial<Record<string, number>> = { dot: 8, check: 14 }

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  const s = size ?? ICON_SIZE[name] ?? 20
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}

// The orexi plate logo mark.
export function PlateMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="#2D4F3C" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="#D97948" />
    </svg>
  )
}

/* ---------- Pill ---------- */
type PillTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger'
const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-brand-soft text-brand',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-[#E5F1EB] text-success',
  warn: 'bg-[#FBF1DA] text-[#A37620]',
  danger: 'bg-[#F6E1E1] text-danger',
}
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10.5px] font-semibold uppercase tracking-[0.08em] ${PILL_TONES[tone]}`}>
      {children}
    </span>
  )
}

/* ---------- Btn ---------- */
type BtnVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'
const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-soft',
  accent: 'bg-accent text-white hover:bg-accent-hover',
  ghost: 'text-ink-soft hover:text-ink hover:bg-brand-soft',
  danger: 'text-danger border border-danger/40 hover:bg-danger/5 bg-surface',
}
const BTN_SIZES: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-12 px-5 text-[15px]',
}
export function Btn({
  variant = 'primary', size = 'md', children, className = '', type = 'button',
  disabled, onClick,
}: {
  variant?: BtnVariant; size?: BtnSize; children: ReactNode; className?: string
  type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void
}) {
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded transition disabled:opacity-50 ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------- KPI ---------- */
type KpiTone = 'brand' | 'accent' | 'success' | 'warn' | 'danger'
export function KPI({
  label, value, sub, tone = 'brand', icon,
}: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: KpiTone; icon?: IconName }) {
  return (
    <div className="bg-surface border border-line rounded-md shadow-sm p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: `var(--${tone})` }} />
      <div className="flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-[0.06em] text-ink-soft font-semibold">{label}</div>
        {icon && <div className="text-ink-faint"><Icon name={icon} /></div>}
      </div>
      <div className="num text-[28px] font-semibold mt-2 leading-none">{value}</div>
      {sub && <div className="text-[12px] text-ink-soft mt-1.5">{sub}</div>}
    </div>
  )
}

/* ---------- FormSection / Field / inputs ---------- */
export function FormSection({ title, sub, children }: { title: ReactNode; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
      <div className="grid md:grid-cols-[240px_1fr] gap-0">
        <div className="p-6 border-b md:border-b-0 md:border-r border-line bg-bg/40">
          <h3 className="font-display text-[18px] font-semibold">{title}</h3>
          <p className="text-[12.5px] text-ink-soft mt-1 leading-[18px]">{sub}</p>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="block text-[12.5px] font-semibold text-ink mb-1.5">{label}</span>}
      {children}
      {hint && <span className="block text-[11.5px] text-ink-soft mt-1.5">{hint}</span>}
    </label>
  )
}

export const txtInputCls =
  'w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition'
export const selectCls =
  'w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition'

/* ---------- RadioCard ---------- */
export function RadioCard({
  name, checked, title, sub, onClick,
}: { name: string; checked: boolean; title: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  return (
    <label
      onClick={onClick}
      className={`flex items-start gap-3 p-3.5 border-2 ${checked ? 'border-brand bg-brand-soft/30' : 'border-line bg-surface hover:border-ink-soft'} rounded cursor-pointer transition`}
    >
      <input type="radio" name={name} checked={checked} readOnly className="mt-1 accent-brand w-4 h-4 pointer-events-none" />
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold">{title}</div>
        {sub && <div className="text-[12px] text-ink-soft mt-0.5 leading-[18px]">{sub}</div>}
      </div>
    </label>
  )
}

/* ---------- Sparkbars (benefit + extra stacked) ---------- */
export function Sparkbars({ series }: { series: { benefit: number; extra: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.benefit + d.extra))
  return (
    <div className="flex items-end gap-[3px] h-[140px]">
      {series.map((d, i) => {
        const total = d.benefit + d.extra
        const h = Math.max(2, (total / max) * 140)
        const benefitH = total > 0 ? (d.benefit / total) * h : 0
        return (
          <div key={i} className="flex-1 flex flex-col justify-end group relative">
            <div className="relative w-full" style={{ height: h }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-xs bg-brand" style={{ height: benefitH }} />
              <div className="absolute inset-x-0 rounded-t-xs bg-accent" style={{ top: 0, height: h - benefitH }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- activity icon chip ---------- */
type ActKind = 'order' | 'signup' | 'invoice' | 'benefit_start' | 'topup_failed'
export function ActIcon({ kind }: { kind: ActKind }) {
  const map: Record<ActKind, { icon: IconName; bg: string }> = {
    order: { icon: 'shop', bg: 'bg-brand-soft text-brand' },
    signup: { icon: 'user', bg: 'bg-[#E5F1EB] text-success' },
    invoice: { icon: 'file', bg: 'bg-accent-soft text-accent' },
    benefit_start: { icon: 'wallet', bg: 'bg-brand-soft text-brand' },
    topup_failed: { icon: 'bell', bg: 'bg-[#F6E1E1] text-danger' },
  }
  const c = map[kind]
  return (
    <div className={`w-8 h-8 rounded-sm ${c.bg} flex items-center justify-center shrink-0`}>
      <Icon name={c.icon} />
    </div>
  )
}
