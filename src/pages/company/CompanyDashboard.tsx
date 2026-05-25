import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { fmtMoney } from '../../lib/helpers'

type Dash = {
  totals: { orders: number; gross: number; benefit: number; topup: number; employees: number }
  trend: { date: string; gross: number; benefit: number; orders: number }[]
  byWeekday: { day: string; orders: number; gross: number }[]
  topUsers: { name: string; orders: number; gross: number }[]
  byVendor: { vendor: string; orders: number; gross: number }[]
}

export default function CompanyDashboard() {
  const { session } = useAuthStore()
  const { selectedId, companies } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [data, setData] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const from = '2026-03-01'
  const to = new Date().toISOString().slice(0, 10)
  const m = (c: number) => fmtMoney(c, lang)
  const companyName = companies.find((c) => c.id === selectedId)?.name

  useEffect(() => {
    if (!session?.access_token || !selectedId) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-dashboard?companyId=${selectedId}&from=${from}&to=${to}`, {
          headers: { authorization: `Bearer ${session.access_token}` },
        })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        setData(await r.json())
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [session?.access_token, selectedId])

  const maxTrend = data ? Math.max(1, ...data.trend.map((t) => t.gross)) : 1
  const maxWd = data ? Math.max(1, ...data.byWeekday.map((w) => w.gross)) : 1

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-ink">{L('Πίνακας', 'Dashboard')}</h1>
        <p className="text-sm text-ink-soft">
          {companyName} · {L('περίοδος', 'period')} {from} → {to}
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {data && (
        <div className="grid gap-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              { label: L('Παραγγελίες', 'Orders'), val: data.totals.orders.toLocaleString() },
              { label: L('Τζίρος', 'Gross'), val: m(data.totals.gross) },
              { label: L('Παροχή', 'Benefit'), val: m(data.totals.benefit), accent: true },
              { label: L('Πληρωμή υπαλλήλου', 'Top-up'), val: m(data.totals.topup) },
              { label: L('Ενεργοί υπάλληλοι', 'Active employees'), val: data.totals.employees.toLocaleString() },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{k.label}</div>
                <div className={`mt-1 font-display text-2xl font-semibold ${k.accent ? 'text-brand' : 'text-ink'}`}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Spend trend */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">{L('Τάση δαπανών', 'Spending trend')}</h2>
            {data.trend.length === 0 ? <p className="text-sm text-ink-soft">{L('Καμία δραστηριότητα', 'No activity')}</p> : (
              <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 160 }}>
                {data.trend.map((t) => (
                  <div key={t.date} className="flex flex-col items-center justify-end" style={{ minWidth: 10 }} title={`${t.date}: ${m(t.gross)} (${t.orders})`}>
                    <div className="w-2 rounded-t bg-brand" style={{ height: `${(t.gross / maxTrend) * 140}px` }} />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-between text-xs text-ink-faint">
              <span>{data.trend[0]?.date}</span><span>{data.trend[data.trend.length - 1]?.date}</span>
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            {/* By weekday */}
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">{L('Χρήση ανά ημέρα', 'Usage by weekday')}</h2>
              <div className="grid gap-2">
                {data.byWeekday.map((w) => (
                  <div key={w.day} className="flex items-center gap-3">
                    <span className="w-10 text-xs text-ink-soft">{w.day}</span>
                    <div className="h-4 flex-1 rounded bg-bg">
                      <div className="h-4 rounded bg-accent" style={{ width: `${(w.gross / maxWd) * 100}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs tabular-nums text-ink-soft">{m(w.gross)}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Top users */}
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">{L('Top χρήστες', 'Top users')}</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-ink-faint">
                  <th className="pb-2">{L('Υπάλληλος', 'Employee')}</th>
                  <th className="pb-2 text-right">{L('Παρ.', 'Ord.')}</th>
                  <th className="pb-2 text-right">{L('Τζίρος', 'Gross')}</th>
                </tr></thead>
                <tbody>
                  {data.topUsers.map((u, i) => (
                    <tr key={i} className="border-t border-line/60">
                      <td className="py-1.5 text-ink">{u.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-soft">{u.orders}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink">{m(u.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* By vendor */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">{L('Δαπάνες ανά συνεργάτη', 'Spend by vendor')}</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-faint">
                <th className="pb-2">{L('Συνεργάτης', 'Vendor')}</th>
                <th className="pb-2 text-right">{L('Παραγγελίες', 'Orders')}</th>
                <th className="pb-2 text-right">{L('Τζίρος', 'Gross')}</th>
              </tr></thead>
              <tbody>
                {data.byVendor.map((v, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-1.5 text-ink">{v.vendor}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-soft">{v.orders}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink">{m(v.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  )
}
