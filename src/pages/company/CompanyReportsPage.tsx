import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { fmtMoney } from '../../lib/helpers'

type Report = {
  totals: { orders: number; gross: number; benefit: number; topup: number }
  perEmployee: { name: string; voucher: string; orders: number; gross: number; benefit: number; topup: number }[]
  perDay: { date: string; orders: number; employees: number; gross: number; benefit: number; topup: number }[]
  orders: { date: string | null; token: string | null; voucher: string | null; employee: string | null; gross: number; benefit: number; topup: number }[]
  orderCountTotal: number
}

export default function CompanyReportsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token
  const m = (c: number) => fmtMoney(c, lang)

  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('2026-03-01')
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

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

  const th = 'px-3 py-2 text-left text-xs font-medium text-ink-faint border-b border-line'
  const thr = th + ' text-right'
  const td = 'px-3 py-1.5 text-sm text-ink border-b border-line/50'
  const tdr = td + ' text-right tabular-nums'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{L('Αναφορές', 'Reports')}</h1>
          <p className="text-sm text-ink-soft">{L('Ζωντανά δεδομένα — συγχρονισμός κάθε 30′', 'Live data — synced every 30 min')}</p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <label className="text-xs text-ink-soft">{L('Από', 'From')}<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-ink-soft">{L('Έως', 'To')}<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1.5 text-sm" /></label>
          <button onClick={() => void load()} disabled={loading} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">{loading ? '…' : L('Εφαρμογή', 'Apply')}</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {data && (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { l: L('Παραγγελίες', 'Orders'), v: data.totals.orders.toLocaleString() },
              { l: L('Τζίρος', 'Gross'), v: m(data.totals.gross) },
              { l: L('Παροχή (τιμολόγηση)', 'Benefit (invoice)'), v: m(data.totals.benefit), accent: true },
              { l: L('Πληρωμή υπαλλήλου', 'Top-up'), v: m(data.totals.topup) },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-line bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-ink-faint">{k.l}</div>
                <div className={`mt-1 font-display text-2xl font-semibold ${k.accent ? 'text-brand' : 'text-ink'}`}>{k.v}</div>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-line bg-surface p-1">
            <h2 className="px-4 pt-3 font-display text-lg font-semibold text-ink">{L('Ανά υπάλληλο', 'Per employee')}</h2>
            <div className="max-h-96 overflow-auto p-3">
              <table className="w-full"><thead><tr>
                <th className={th}>{L('Υπάλληλος', 'Employee')}</th><th className={th}>Voucher</th>
                <th className={thr}>{L('Παρ.', 'Ord.')}</th><th className={thr}>{L('Τζίρος', 'Gross')}</th><th className={thr}>{L('Παροχή', 'Benefit')}</th><th className={thr}>{L('Top-up', 'Top-up')}</th>
              </tr></thead><tbody>
                {data.perEmployee.map((e, i) => (
                  <tr key={i}><td className={td}>{e.name}</td><td className={td + ' font-mono text-xs'}>{e.voucher}</td>
                    <td className={tdr}>{e.orders}</td><td className={tdr}>{m(e.gross)}</td><td className={tdr}>{m(e.benefit)}</td><td className={tdr}>{m(e.topup)}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-1">
            <h2 className="px-4 pt-3 font-display text-lg font-semibold text-ink">{L('Ημερολόγιο παραγγελιών', 'Order log')} <span className="text-sm font-normal text-ink-faint">({data.orders.length}/{data.orderCountTotal})</span></h2>
            <div className="max-h-[28rem] overflow-auto p-3">
              <table className="w-full"><thead><tr>
                <th className={th}>{L('Ημ/νία', 'Date')}</th><th className={th}>Token</th><th className={th}>Voucher</th><th className={th}>{L('Υπάλληλος', 'Employee')}</th>
                <th className={thr}>{L('Τζίρος', 'Gross')}</th><th className={thr}>{L('Παροχή', 'Benefit')}</th><th className={thr}>{L('Top-up', 'Top-up')}</th>
              </tr></thead><tbody>
                {data.orders.map((o, i) => (
                  <tr key={i}><td className={td}>{o.date}</td><td className={td + ' font-mono text-xs'}>{o.token}</td><td className={td + ' font-mono text-xs'}>{o.voucher}</td><td className={td}>{o.employee ?? '—'}</td>
                    <td className={tdr}>{m(o.gross)}</td><td className={tdr}>{m(o.benefit)}</td><td className={tdr}>{m(o.topup)}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
