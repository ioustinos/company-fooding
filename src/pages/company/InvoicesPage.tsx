import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, KPI, Pill, moneyFull } from '../../lib/specui'
import { downloadInvoicePdf } from '../../lib/invoicePdf'

type Invoice = { vendor_id: string | null; vendor_name: string; month: string; orders: number; gross: number; benefit: number; extra: number; status: 'open' | 'current' }
type Data = { period: { from: string; to: string }; totals: { orders: number; gross: number; benefit: number; extra: number }; invoices: Invoice[] }

const monthLabel = (m: string, lang: 'el' | 'en') => {
  const [y, mo] = m.split('-')
  const d = new Date(Number(y), Number(mo) - 1, 1)
  return d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { month: 'long', year: 'numeric' })
}

export default function InvoicesPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('2026-03-01')
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [tab, setTab] = useState<'all' | 'open' | 'current'>('all')
  const [company, setCompany] = useState<{ name: string; vat_number: string | null; billing_email: string | null } | null>(null)

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-invoices?companyId=${selectedId}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      setData(await r.json())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  // pull company profile for the PDF header
  useEffect(() => {
    if (!token || !selectedId) return
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-company?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
        if (r.ok) { const d = await r.json(); setCompany(d.company) }
      } catch { /* ignore */ }
    })()
  }, [token, selectedId])

  function exportPdf(inv: Invoice) {
    if (!company) return
    downloadInvoicePdf({
      company,
      vendor: { name: inv.vendor_name, legal_name: null },
      invoice: { vendor_name: inv.vendor_name, month: inv.month, orders: inv.orders, gross: inv.gross, benefit: inv.benefit, extra: inv.extra },
      lang,
    })
  }

  const grouped = useMemo(() => {
    if (!data) return [] as { month: string; rows: Invoice[]; total: { gross: number; benefit: number; extra: number; orders: number } }[]
    const map = new Map<string, { month: string; rows: Invoice[]; total: { gross: number; benefit: number; extra: number; orders: number } }>()
    for (const inv of data.invoices) {
      if (tab !== 'all' && inv.status !== tab) continue
      const g = map.get(inv.month) ?? { month: inv.month, rows: [], total: { gross: 0, benefit: 0, extra: 0, orders: 0 } }
      g.rows.push(inv)
      g.total.gross += inv.gross; g.total.benefit += inv.benefit; g.total.extra += inv.extra; g.total.orders += inv.orders
      map.set(inv.month, g)
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month))
  }, [data, tab])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Τιμολόγια', 'Invoices')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Αυτόματα παραγόμενα από τη χρήση παροχής ανά μήνα και συνεργάτη.', 'Auto-derived from benefit usage per month per vendor.')}</p>
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
        </div>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label={L('Σύνολο τιμολογίων', 'Invoices')} value={data.invoices.length} tone="brand" icon="file" />
            <KPI label={L('Δαπάνη', 'Spend')} value={moneyFull(data.totals.gross, lang)} tone="accent" icon="wallet" />
            <KPI label={L('Παροχή (τιμολόγηση)', 'Benefit (billable)')} value={moneyFull(data.totals.benefit, lang)} tone="success" icon="chart" sub={L('αυτό χρεώνεται η εταιρεία', "this is what the company is billed")} />
            <KPI label={L('Από υπαλλήλους', 'Paid by employees')} value={moneyFull(data.totals.extra, lang)} tone="warn" icon="users" sub={L('εκτός παροχής', 'beyond the benefit')} />
          </div>

          <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5 w-fit">
            {(['all', 'current', 'open'] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium transition ${tab === k ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
                {k === 'all' ? L('Όλα', 'All') : k === 'current' ? L('Τρέχων μήνας', 'Current month') : L('Προηγούμενοι', 'Past months')}
              </button>
            ))}
          </div>

          {grouped.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="file" /></div>
              <div className="font-display text-[20px] font-semibold">{L('Κανένα τιμολόγιο στην περίοδο', 'No invoices in this period')}</div>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={g.month} className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-line">
                    <h2 className="font-display text-[18px] font-semibold flex items-center gap-2">
                      {monthLabel(g.month, lang)}
                      {g.month === new Date().toISOString().slice(0, 7) && <Pill tone="accent">{L('τρέχων', 'current')}</Pill>}
                    </h2>
                    <div className="text-right text-[12.5px]">
                      <div className="num text-[16px] font-semibold">{moneyFull(g.total.benefit, lang)}</div>
                      <div className="text-ink-faint">{L('παροχή προς τιμολόγηση', 'billable benefit')}</div>
                    </div>
                  </div>
                  <table className="w-full text-[14px]">
                    <thead className="bg-bg/40 border-b border-line">
                      <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                        <th className="px-5 py-2.5">{L('Συνεργάτης', 'Vendor')}</th>
                        <th className="px-5 py-2.5 text-right">{L('Παρ.', 'Ord.')}</th>
                        <th className="px-5 py-2.5 text-right">{L('Δαπάνη', 'Spend')}</th>
                        <th className="px-5 py-2.5 text-right">{L('Παροχή', 'Benefit')}</th>
                        <th className="px-5 py-2.5 text-right">{L('Επιπλέον', 'Extra')}</th>
                        <th className="px-5 py-2.5">{L('Κατάσταση', 'Status')}</th>
                        <th className="px-5 py-2.5 text-right">{L('PDF', 'PDF')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {g.rows.map((inv) => (
                        <tr key={`${inv.vendor_id}-${inv.month}`} className="hover:bg-brand-soft/20">
                          <td className="px-5 py-2.5"><div className="flex items-center gap-2"><Icon name="shop" /><span className="font-medium">{inv.vendor_name}</span></div></td>
                          <td className="px-5 py-2.5 text-right num">{inv.orders}</td>
                          <td className="px-5 py-2.5 text-right num">{moneyFull(inv.gross, lang)}</td>
                          <td className="px-5 py-2.5 text-right num text-brand font-semibold">{moneyFull(inv.benefit, lang)}</td>
                          <td className="px-5 py-2.5 text-right num text-ink-soft">{moneyFull(inv.extra, lang)}</td>
                          <td className="px-5 py-2.5"><Pill tone={inv.status === 'current' ? 'accent' : 'warn'}>{inv.status === 'current' ? L('τρέχον', 'current') : L('εκκρεμές', 'open')}</Pill></td>
                          <td className="px-5 py-2.5 text-right">
                            <button onClick={() => exportPdf(inv)} disabled={!company} title={L('Κατέβασμα PDF', 'Download PDF')}
                              className="text-ink-faint hover:text-brand disabled:opacity-30 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-brand-soft/40">
                              <Icon name="file" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
