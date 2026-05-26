import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, KPI, Pill, moneyFull } from '../../lib/specui'
import { SpendChart } from '../../lib/specCharts'
import { downloadCsv } from '../../lib/csv'

type Row = {
  company_id: string; name: string; status: string
  employees_active: number; benefits_active: number
  orders: number; gross: number; benefit: number; extra: number
  benefit_pct: number
  last_order_at: string | null; last_topup_at: string | null
  topup_failed: number
}

export default function CompaniesReportPage() {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [from, setFrom] = useState('2026-03-01')
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'gross' | 'orders' | 'benefit_pct' | 'employees_active' | 'name'>('gross')

  async function load() {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-companies-report?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json(); setRows(d.companies ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token])

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    return Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0)
  })
  const totals = rows.reduce((a, r) => ({
    orders: a.orders + r.orders, gross: a.gross + r.gross,
    benefit: a.benefit + r.benefit, extra: a.extra + r.extra,
    employees: a.employees + r.employees_active,
  }), { orders: 0, gross: 0, benefit: 0, extra: 0, employees: 0 })
  const benefitShare = totals.gross > 0 ? Math.round((totals.benefit / totals.gross) * 100) : 0

  // tiny "share of total spend" stacked bar chart per company
  const chartData = sorted.map((r) => ({ date: r.name, benefit: r.benefit, extra: r.extra }))

  return (
    <section className="p-8 space-y-6 max-w-[1200px]">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Σύγκριση εταιρειών', 'Companies comparison')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Όλες οι εταιρείες σε μία οθόνη.', 'All companies on one screen.')}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Από', 'From')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Έως', 'To')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono" />
          </div>
          <Btn variant="primary" size="md" disabled={loading} onClick={() => void load()}>{loading ? '…' : L('Εφαρμογή', 'Apply')}</Btn>
          <Btn variant="secondary" size="md" onClick={() => downloadCsv(
            `companies-${from}-${to}.csv`,
            ['name', 'status', 'employees', 'benefits_active', 'orders', 'gross_eur', 'benefit_eur', 'extra_eur', 'benefit_pct', 'last_order', 'last_topup', 'topup_failed'],
            sorted.map((r) => [r.name, r.status, r.employees_active, r.benefits_active, r.orders, (r.gross / 100).toFixed(2), (r.benefit / 100).toFixed(2), (r.extra / 100).toFixed(2), r.benefit_pct, r.last_order_at ?? '', r.last_topup_at ?? '', r.topup_failed]),
          )}><Icon name="file" /><span>{L('Εξαγωγή CSV', 'Export CSV')}</span></Btn>
        </div>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI label={L('Εταιρείες', 'Companies')} value={rows.length} tone="brand" icon="office" />
        <KPI label={L('Ενεργοί υπάλληλοι', 'Active employees')} value={totals.employees} tone="success" icon="users" />
        <KPI label={L('Παραγγελίες', 'Orders')} value={totals.orders} tone="warn" icon="shop" />
        <KPI label={L('Συνολική δαπάνη', 'Total spend')} value={moneyFull(totals.gross, lang)} tone="accent" icon="wallet" sub={`${from} → ${to}`} />
        <KPI label={L('Παροχή', 'Benefit')} value={moneyFull(totals.benefit, lang)} tone="success" icon="chart" sub={`${benefitShare}%`} />
      </div>

      {rows.length > 0 && (
        <div className="bg-surface border border-line rounded-md shadow-sm p-5">
          <div className="flex items-start justify-between mb-3">
            <h2 className="font-display text-[18px] font-semibold">{L('Δαπάνη ανά εταιρεία', 'Spend per company')}</h2>
            <div className="flex items-center gap-4 text-[11.5px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-brand"></span>{L('Παροχή', 'Benefit')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-accent"></span>{L('Επιπλέον', 'Extra')}</span>
            </div>
          </div>
          <SpendChart data={chartData} lang={lang} height={200} />
        </div>
      )}

      <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-bg/40 border-b border-line">
            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
              <th className="px-4 py-2.5 cursor-pointer" onClick={() => setSortBy('name')}>{L('Εταιρεία', 'Company')}{sortBy === 'name' && ' ↓'}</th>
              <th className="px-4 py-2.5">{L('Κατάσταση', 'Status')}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" onClick={() => setSortBy('employees_active')}>{L('Υπάλληλοι', 'Employees')}{sortBy === 'employees_active' && ' ↓'}</th>
              <th className="px-4 py-2.5 text-right">{L('Παροχές', 'Benefits')}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" onClick={() => setSortBy('orders')}>{L('Παρ.', 'Ord.')}{sortBy === 'orders' && ' ↓'}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" onClick={() => setSortBy('gross')}>{L('Δαπάνη', 'Spend')}{sortBy === 'gross' && ' ↓'}</th>
              <th className="px-4 py-2.5 text-right">{L('Παροχή', 'Benefit')}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" onClick={() => setSortBy('benefit_pct')}>{L('Παροχή %', 'Benefit %')}{sortBy === 'benefit_pct' && ' ↓'}</th>
              <th className="px-4 py-2.5">{L('Τελευταία παραγγ.', 'Last order')}</th>
              <th className="px-4 py-2.5">{L('Τελευτ. top-up', 'Last top-up')}</th>
              <th className="px-4 py-2.5 text-right">{L('Σφάλματα', 'Errors')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.company_id} className="hover:bg-brand-soft/20">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5"><Pill tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</Pill></td>
                <td className="px-4 py-2.5 text-right num">{r.employees_active}</td>
                <td className="px-4 py-2.5 text-right num text-ink-soft">{r.benefits_active}</td>
                <td className="px-4 py-2.5 text-right num">{r.orders}</td>
                <td className="px-4 py-2.5 text-right num">{moneyFull(r.gross, lang)}</td>
                <td className="px-4 py-2.5 text-right num text-brand">{moneyFull(r.benefit, lang)}</td>
                <td className="px-4 py-2.5 text-right num">{r.benefit_pct}%</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-soft">{r.last_order_at ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-soft">{r.last_topup_at ? r.last_topup_at.slice(0, 10) : '—'}</td>
                <td className={`px-4 py-2.5 text-right num ${r.topup_failed > 0 ? 'text-danger font-semibold' : 'text-ink-faint'}`}>{r.topup_failed || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
