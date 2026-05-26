import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, KPI, Pill } from '../../lib/specui'

type Voucher = { id: string; code?: string; isActive?: boolean; discount?: number; discountType?: string; type?: string; endDate?: string; initialValue?: number | null }
type Missing = { assignment_id: string; voucher_code: string | null; employee: string | null }
type Store = {
  store_id: string; total_in_go: number; active_in_go: number; cf_active: number
  orphans: Voucher[]; missing: Missing[]; stale: Voucher[]; vouchers: Voucher[]
}
type Data = { stores: Store[] }

export default function VouchersHealthPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-vouchers-health?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      setData(await r.json())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Υγεία voucher (GO)', 'Voucher health (GO)')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Ζωντανή σύγκριση των vouchers στο GonnaOrder με τις αναθέσεις στο CF.', 'Live diff of GonnaOrder vouchers against CF assignments.')}</p>
        </div>
        <Btn variant="primary" size="md" disabled={loading} onClick={() => void load()}><Icon name="history" /><span>{loading ? L('Φόρτωση…', 'Loading…') : L('Ανανέωση', 'Refresh')}</span></Btn>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {!data && !loading && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {data && data.stores.length === 0 && (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center text-ink-faint">{L('Καμία ενεργή σύνδεση με κατάστημα GO', 'No active GO store link')}</div>
      )}

      {data?.stores.map((s) => {
        const orphanCount = s.orphans.length
        const missingCount = s.missing.length
        const staleCount = s.stale.length
        const healthy = orphanCount === 0 && missingCount === 0 && staleCount === 0
        return (
          <div key={s.store_id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[20px] font-semibold">{L('Κατάστημα', 'Store')} <span className="font-mono text-[16px] text-ink-soft">#{s.store_id}</span></h2>
              {healthy && <Pill tone="success">{L('Υγιές', 'Healthy')}</Pill>}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI label={L('Vouchers στο GO', 'Vouchers in GO')} value={s.total_in_go} tone="brand" icon="wallet" sub={`${s.active_in_go} ${L('ενεργά', 'active')}`} />
              <KPI label={L('CF αναθέσεις', 'CF assignments')} value={s.cf_active} tone="accent" icon="users" />
              <KPI label={L('Ορφανά στο GO', 'Orphans in GO')} value={orphanCount} tone={orphanCount > 0 ? 'warn' : 'success'} icon="bell" sub={L('χωρίς CF αντιστοιχία', 'no CF match')} />
              <KPI label={L('Λείπουν στο GO', 'Missing in GO')} value={missingCount} tone={missingCount > 0 ? 'danger' : 'success'} icon="bell" sub={L('CF αναθέσεις χωρίς voucher', 'CF assignments with no voucher')} />
            </div>

            {missingCount > 0 && (
              <div className="bg-surface border border-line rounded-md shadow-sm">
                <div className="p-4 border-b border-line">
                  <h3 className="font-display text-[16px] font-semibold">{L('CF αναθέσεις χωρίς voucher στο GO', 'CF assignments missing a GO voucher')}</h3>
                  <p className="text-[12.5px] text-ink-soft mt-1">{L('Το cf-topups θα τα δημιουργήσει στον επόμενο γύρο (αν δεν είναι σε dry-run).', 'cf-topups will create them on the next run (unless dry-run).')}</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead className="bg-bg/40 border-b border-line">
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                      <th className="px-4 py-2">{L('Υπάλληλος', 'Employee')}</th>
                      <th className="px-4 py-2">{L('Voucher code', 'Voucher code')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.missing.map((m) => (
                      <tr key={m.assignment_id} className="hover:bg-brand-soft/20">
                        <td className="px-4 py-2">{m.employee ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-[12px] text-ink-soft">{m.voucher_code ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {orphanCount > 0 && (
              <div className="bg-surface border border-line rounded-md shadow-sm">
                <div className="p-4 border-b border-line">
                  <h3 className="font-display text-[16px] font-semibold">{L('Vouchers στο GO χωρίς CF αντιστοιχία', 'GO vouchers with no CF match')}</h3>
                  <p className="text-[12.5px] text-ink-soft mt-1">{L('Πιθανώς παλιά vouchers από πριν την CF, ή χειροκίνητα από admin.', 'Likely pre-CF or manually created in GO admin.')}</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead className="bg-bg/40 border-b border-line">
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                      <th className="px-4 py-2">{L('Code', 'Code')}</th>
                      <th className="px-4 py-2">{L('Έκπτωση', 'Discount')}</th>
                      <th className="px-4 py-2">{L('Τύπος', 'Type')}</th>
                      <th className="px-4 py-2">{L('Λήγει', 'Expires')}</th>
                      <th className="px-4 py-2">{L('Ενεργό', 'Active')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.orphans.map((v) => (
                      <tr key={v.id} className="hover:bg-brand-soft/20">
                        <td className="px-4 py-2 font-mono text-[12px]">{v.code ?? '—'}</td>
                        <td className="px-4 py-2 num">{v.discount ?? '—'} {v.discountType === 'PERCENTILE' ? '%' : '€'}</td>
                        <td className="px-4 py-2 text-[11.5px]">{v.discountType ?? '—'} · {v.type ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-[11.5px] text-ink-soft">{v.endDate ? v.endDate.slice(0, 10) : '—'}</td>
                        <td className="px-4 py-2">{v.isActive ? <Pill tone="success">on</Pill> : <Pill tone="neutral">off</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {staleCount > 0 && (
              <div className="bg-surface border border-line rounded-md shadow-sm">
                <div className="p-4 border-b border-line">
                  <h3 className="font-display text-[16px] font-semibold">{L(`Παλιά vouchers (λήξη ≤ σήμερα)`, `Stale vouchers (endDate ≤ today)`)}</h3>
                  <p className="text-[12.5px] text-ink-soft mt-1">{L('cf-topups θα ανανεώσει την ημερομηνία λήξης στον επόμενο γύρο.', 'cf-topups will refresh the endDate on the next run.')}</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead className="bg-bg/40 border-b border-line">
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                      <th className="px-4 py-2">{L('Code', 'Code')}</th>
                      <th className="px-4 py-2">{L('Λήγει', 'Expires')}</th>
                      <th className="px-4 py-2">{L('Ενεργό', 'Active')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.stale.map((v) => (
                      <tr key={v.id} className="hover:bg-brand-soft/20">
                        <td className="px-4 py-2 font-mono text-[12px]">{v.code ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-[11.5px] text-danger">{v.endDate?.slice(0, 10) ?? '—'}</td>
                        <td className="px-4 py-2">{v.isActive ? <Pill tone="success">on</Pill> : <Pill tone="neutral">off</Pill>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
