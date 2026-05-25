import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { fmtMoney } from '../../lib/helpers'

type Totals = { orders: number; gross: number; benefit: number; topup: number }
type CompanyRow = { company: string; orders: number; employees: number; gross: number; benefit: number; topup: number }
type EmployeeRow = { company: string; name: string; voucher: string; orders: number; gross: number; benefit: number; topup: number }
type DayRow = { date: string; orders: number; employees: number; gross: number; benefit: number; topup: number }
type OrderRow = {
  date: string | null; token: string | null; voucher: string | null
  employee: string | null; company: string | null
  gross: number; benefit: number; topup: number; status: string
}
type ReportData = {
  scope: string
  role: string
  period: { from: string; to: string }
  totals: Totals
  perCompany: CompanyRow[]
  perEmployee: EmployeeRow[]
  perDay: DayRow[]
  orders: OrderRow[]
  orderCountTotal: number
}

const card: React.CSSProperties = {
  background: 'var(--cf-surface, #f8fafc)',
  border: '1px solid var(--cf-border, #e2e8f0)',
  borderRadius: 10,
  padding: '14px 16px',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--cf-muted, #64748b)', borderBottom: '2px solid var(--cf-border, #e2e8f0)', whiteSpace: 'nowrap' }
const thR: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid var(--cf-border, #f1f5f9)' }
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export default function ReportsPage() {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState('2026-03-01')
  const [to, setTo] = useState(today)

  async function load() {
    if (!session?.access_token) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/cf-report?from=${from}&to=${to}`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Report request failed (${res.status})`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() /* eslint-disable-next-line */ }, [session?.access_token])

  const m = (c: number) => fmtMoney(c, lang)

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <p className="cf-muted" style={{ margin: '4px 0 0' }}>
            Live order data from GonnaOrder (synced every 30 min).
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>From<br /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>To<br /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Apply'}</button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--cf-danger, #dc2626)', padding: 12, border: '1px solid var(--cf-danger, #dc2626)', borderRadius: 8 }}>{error}</div>}
      {loading && !data && <div className="cf-muted">Loading report…</div>}

      {data && (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div style={card}><div className="cf-muted" style={{ fontSize: 12 }}>Orders</div><div style={{ fontSize: 22, fontWeight: 700 }}>{data.totals.orders.toLocaleString()}</div></div>
            <div style={card}><div className="cf-muted" style={{ fontSize: 12 }}>Gross</div><div style={{ fontSize: 22, fontWeight: 700 }}>{m(data.totals.gross)}</div></div>
            <div style={card}><div className="cf-muted" style={{ fontSize: 12 }}>Benefit (invoice)</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cf-green, #16a34a)' }}>{m(data.totals.benefit)}</div></div>
            <div style={card}><div className="cf-muted" style={{ fontSize: 12 }}>Employee top-up</div><div style={{ fontSize: 22, fontWeight: 700 }}>{m(data.totals.topup)}</div></div>
          </div>

          {/* Per company */}
          <section>
            <h2 style={{ fontSize: 16 }}>Per company (invoice basis)</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Company</th><th style={thR}>Employees</th><th style={thR}>Orders</th>
                  <th style={thR}>Gross</th><th style={thR}>Benefit</th><th style={thR}>Top-up</th>
                </tr></thead>
                <tbody>
                  {data.perCompany.map((c) => (
                    <tr key={c.company}>
                      <td style={td}>{c.company}</td>
                      <td style={tdR}>{c.employees}</td>
                      <td style={tdR}>{c.orders}</td>
                      <td style={tdR}>{m(c.gross)}</td>
                      <td style={tdR}>{m(c.benefit)}</td>
                      <td style={tdR}>{m(c.topup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per day */}
          <section>
            <h2 style={{ fontSize: 16 }}>Daily activity</h2>
            <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={thR}>Orders</th><th style={thR}>Employees</th>
                  <th style={thR}>Gross</th><th style={thR}>Benefit</th><th style={thR}>Top-up</th>
                </tr></thead>
                <tbody>
                  {data.perDay.map((d) => (
                    <tr key={d.date}>
                      <td style={td}>{d.date}</td>
                      <td style={tdR}>{d.orders}</td>
                      <td style={tdR}>{d.employees}</td>
                      <td style={tdR}>{m(d.gross)}</td>
                      <td style={tdR}>{m(d.benefit)}</td>
                      <td style={tdR}>{m(d.topup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per employee */}
          <section>
            <h2 style={{ fontSize: 16 }}>Per employee</h2>
            <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Company</th><th style={th}>Employee</th><th style={th}>Voucher</th>
                  <th style={thR}>Orders</th><th style={thR}>Gross</th><th style={thR}>Benefit</th><th style={thR}>Top-up</th>
                </tr></thead>
                <tbody>
                  {data.perEmployee.map((e, i) => (
                    <tr key={`${e.voucher}-${i}`}>
                      <td style={td}>{e.company}</td>
                      <td style={td}>{e.name}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{e.voucher}</td>
                      <td style={tdR}>{e.orders}</td>
                      <td style={tdR}>{m(e.gross)}</td>
                      <td style={tdR}>{m(e.benefit)}</td>
                      <td style={tdR}>{m(e.topup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Order log */}
          <section>
            <h2 style={{ fontSize: 16 }}>
              Order log <span className="cf-muted" style={{ fontWeight: 400, fontSize: 13 }}>(showing {data.orders.length} of {data.orderCountTotal})</span>
            </h2>
            <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Token</th><th style={th}>Voucher</th>
                  <th style={th}>Employee</th><th style={th}>Company</th>
                  <th style={thR}>Gross</th><th style={thR}>Benefit</th><th style={thR}>Top-up</th>
                </tr></thead>
                <tbody>
                  {data.orders.map((o, i) => (
                    <tr key={`${o.token}-${i}`}>
                      <td style={td}>{o.date}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{o.token}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{o.voucher}</td>
                      <td style={td}>{o.employee ?? '—'}</td>
                      <td style={td}>{o.company ?? '—'}</td>
                      <td style={tdR}>{m(o.gross)}</td>
                      <td style={tdR}>{m(o.benefit)}</td>
                      <td style={tdR}>{m(o.topup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
