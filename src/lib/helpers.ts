// Money is always stored in cents (int). Render with fmtMoney.
export function fmtMoney(cents: number, lang: 'el' | 'en' = 'el'): string {
  const euros = cents / 100
  return new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(euros)
}

// ISO date YYYY-MM-DD from a Date. Always treat dates as calendar dates in
// Europe/Athens for business logic; this helper returns the local-date part.
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

// Clamp a value into [min, max]
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

// Convenience: is the date today or in the future (local)
export function isTodayOrFuture(iso: string): boolean {
  return iso >= isoDate()
}
