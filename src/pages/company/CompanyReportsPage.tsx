import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, KPI, Btn, moneyFull } from '../../lib/specui'

type Report = {
  totals: { orders: number; gross: number; benefit: number; topup: number }
  perEmployee: { name: string; voucher: string; orders: number; gross: number; benefit: number; topup: number }[]
  perDay: { date: string; orders: number; employees: number; gross: number; benefit: number; topup: number }[]
  orders: { date: string | null; token: string | null; voucher: string | null; employee: string | null; gross: number; benefit: number; topup: number; status?: string }[]
  orderCountTotal: number
}

type Tab = 'overview' | 'employees' | 'orders'

export default function CompanyReportsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('2026-03-01')
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-report?companyId=${selectedId}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      setData(await r.json())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  function setPreset(days: number) {
    const t = new Date()
    const f = new Date(); f.setDate(t.getDate() - days + 1)
    setFrom(f.toISOString().slice(0, 10)); setTo(t.toISOString().slice(0, 10))
  }

  const benefitShare = data && data.totals.gross > 0
    ? Math.round((data.totals.benefit / data.totals.gross) * 100) : 0
  const avgPerOrder = data && data.totals.orders > 0
    ? data.totals.gross / data.totals.orders : 0

  const filteredEmployees = data?.perEmployee.filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.name.toLowerCase().includes(q) || (e.voucher || '').toLowerCase().includes(q)
  }) ?? []

  const filteredOrders = data?.orders.filter((o) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (o.employee || '').toLowerCase().includes(q) || (o.voucher || '').toLowerCase().includes(q) || (o.token || '').toLowerCase().includes(q)
  }) ?? []

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      {/* header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Αναφορές', 'Reports')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Ζωντανά δεδομένα — συγχρονισμός κάθε 30′ από GonnaOrder.', 'Live data — synced from GonnaOrder every 30 min.')}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Από', 'From')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Έως', 'To')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
          </div>
          <Btn variant="primary" size="md" disabled={loading} onClick={() => void load()}>{loading ? '…' : L('Εφαρμογή', 'Apply')}</Btn>
        </div>
      </div>

      {/* date presets */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          [L('Τελευταίες 7 ημέρες', 'Last 7 days'), 7],
          [L('Τελευταίες 30 ημέρες', 'Last 30 days'), 30],
          [L('Τελευταίοι 90 ημέρες', 'Last 90 days'), 90],
        ] as [string, number][]).map(([label, n]) => (
          <button key={n} onClick={() => setPreset(n)}
            className="h-8 px-3 border border-line bg-surface rounded-xs text-[12.5px] font-medium text-ink-soft hover:text-ink hover:border-ink-soft">
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label={L('Παραγγελίες', 'Orders')} value={data.totals.orders.toLocaleString()}
              tone="warn" icon="shop" sub={L(`μ.ό. ${moneyFull(avgPerOrder, lang)}/παρ.`, `${moneyFull(avgPerOrder, lang)} avg/order`)} />
            <KPI label={L('Συνολική δαπάνη', 'Total spend')} value={moneyFull(data.totals.gross, lang)}
              tone="accent" icon="wallet" sub={`${from} → ${to}`} />
            <KPI label={L('Καλύφθηκε από παροχή', 'Covered by benefit')} value={moneyFull(data.totals.benefit, lang)}
              tone="success" icon="chart" sub={`${benefitShare}%`} />
            <KPI label={L('Πληρωμή υπαλλήλων', 'Employees paid')} value={moneyFull(data.totals.topup, lang)}
              tone="brand" icon="users" sub={L('επιπλέον της παροχής', 'extra beyond benefit')} />
          </div>

          {/* tabs */}
          <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5 w-fit">
            {(['overview', 'employees', 'orders'] as Tab[]).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium transition ${tab === k ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
                {k === 'overview' ? L('Επισκόπηση', 'Overview') : k === 'employees' ? L('Ανά υπάλληλο', 'Per employee') : L('Παραγγελίες', 'Orders')}
                <span className="num text-ink-faint ml-1">{k === 'overview' ? data.perDay.length : k === 'employees' ? data.perEmployee.length : data.orderCountTotal}</span>
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="bg-surface border border-line rounded-md shadow-sm">
              <div className="p-4 border-b border-line">
                <h2 className="font-display text-[18px] font-semibold">{L('Ανά ημέρα', 'Per day')}</h2>
              </div>
              {data.perDay.length === 0 ? (
                <div className="p-6 text-ink-faint text-center">{L('Καμία δραστηριότητα στην περίοδο', 'No activity in the period')}</div>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead className="bg-bg/40 border-b border-line">
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                      <th className="px-4 py-2.5">{L('Ημέρα', 'Day')}</th>
                      <th className="px-4 py-2.5 text-right">{L('Παρ.', 'Ord.')}</th>
                      <th className="px-4 py-2.5 text-right">{L('Υπάλληλοι', 'Employees')}</th>
                      <th className="px-4 py-2.5 text-right">{L('Δαπάνη', 'Spend')}</th>
                      <th className="px-4 py-2.5 text-right">{L('Παροχή', 'Benefit')}</th>
                      <th className="px-4 py-2.5 text-right">{L('Επιπλέον', 'Extra')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.perDay.map((d) => (
                      <tr key={d.date} className="hover:bg-brand-soft/20">
                        <td className="px-4 py-2 font-mono text-[12px]">{d.date}</td>
                        <td className="px-4 py-2 text-right num">{d.orders}</td>
                        <td className="px-4 py-2 text-right num text-ink-soft">{d.employees}</td>
                        <td className="px-4 py-2 text-right num">{moneyFull(d.gross, lang)}</td>
                        <td className="px-4 py-2 text-right num text-brand">{moneyFull(d.benefit, lang)}</td>
                        <td className="px-4 py-2 text-right num text-ink-soft">{moneyFull(d.topup, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(tab === 'employees' || tab === 'orders') && (
            <div className="max-w-xs relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'employees' ? L('Αναζήτηση υπαλλήλου ή voucher…', 'Search employee or voucher…') : L('Αναζήτηση παραγγελίας…', 'Search order…')}
                className="w-full h-10 pl-10 pr-3 bg-surface border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
            </div>
          )}

          {tab === 'employees' && (
            <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
              <table className="w-full text-[13.5px]">
                <thead className="bg-bg/40 border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                    <th className="px-4 py-2.5">{L('Υπάλληλος', 'Employee')}</th>
                    <th className="px-4 py-2.5">{L('Voucher', 'Voucher')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Παρ.', 'Ord.')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Δαπάνη', 'Spend')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Παροχή', 'Benefit')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Επιπλέον', 'Extra')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredEmployees.map((e, i) => (
                    <tr key={i} className="hover:bg-brand-soft/20">
                      <td className="px-4 py-2 truncate">{e.name}</td>
                      <td className="px-4 py-2 font-mono text-[12px] text-ink-soft">{e.voucher}</td>
                      <td className="px-4 py-2 text-right num">{e.orders}</td>
                      <td className="px-4 py-2 text-right num">{moneyFull(e.gross, lang)}</td>
                      <td className="px-4 py-2 text-right num text-brand">{moneyFull(e.benefit, lang)}</td>
                      <td className="px-4 py-2 text-right num text-ink-soft">{moneyFull(e.topup, lang)}</td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-faint">{L('Κανείς δεν παρήγγειλε ακόμη', 'Nobody ordered yet')}</td></tr>
                  )}
                </tbody>
              </table>
              <div className="p-3 border-t border-line text-[12px] text-ink-soft flex items-center justify-between">
                <span>{L(`Εμφάνιση ${filteredEmployees.length} από ${data.perEmployee.length}`, `Showing ${filteredEmployees.length} of ${data.perEmployee.length}`)}</span>
                <span className="text-ink-faint">{L('Σύνολο δαπάνης:', 'Total spend:')} <span className="num text-ink font-semibold ml-1">{moneyFull(filteredEmployees.reduce((a, e) => a + e.gross, 0), lang)}</span></span>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-bg/40 border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                    <th className="px-4 py-2.5">{L('Ημ/νία', 'Date')}</th>
                    <th className="px-4 py-2.5">{L('Token', 'Token')}</th>
                    <th className="px-4 py-2.5">{L('Υπάλληλος', 'Employee')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Σύνολο', 'Total')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Παροχή', 'Benefit')}</th>
                    <th className="px-4 py-2.5 text-right">{L('Επιπλέον', 'Extra')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredOrders.map((o, i) => (
                    <tr key={i} className="hover:bg-brand-soft/20">
                      <td className="px-4 py-2 font-mono text-[12px]">{o.date ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-[12px] text-ink-soft truncate">{o.token ?? '—'}</td>
                      <td className="px-4 py-2 truncate">{o.employee ?? (o.voucher ?? '—')}</td>
                      <td className="px-4 py-2 text-right num">{moneyFull(o.gross, lang)}</td>
                      <td className="px-4 py-2 text-right num text-brand">{moneyFull(o.benefit, lang)}</td>
                      <td className="px-4 py-2 text-right num text-ink-soft">{o.topup > 0 ? moneyFull(o.topup, lang) : '—'}</td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-faint">{L('Καμία παραγγελία', 'No orders')}</td></tr>
                  )}
                </tbody>
              </table>
              <div className="p-3 border-t border-line text-[12px] text-ink-soft flex items-center justify-between">
                <span>{L(`Εμφάνιση ${filteredOrders.length} από ${data.orderCountTotal}`, `Showing ${filteredOrders.length} of ${data.orderCountTotal}`)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
