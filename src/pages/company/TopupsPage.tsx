import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Pill, moneyFull } from '../../lib/specui'

type Topup = {
  id: string
  scheduled_for: string
  status: 'pending' | 'applied' | 'skipped' | 'failed'
  amount: number
  gonnaorder_voucher_code: string | null
  applied_at: string | null
  error_detail: string | null
  benefits: { name_el: string; name_en: string; company_id: string } | null
  employees: { display_name: string } | null
}

export default function TopupsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rows, setRows] = useState<Topup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'applied' | 'failed' | 'skipped'>('all')

  useEffect(() => {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-topups?companyId=${selectedId}&limit=200`, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        const d = await r.json(); setRows(d.topups ?? [])
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [token, selectedId])

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter)
  const counts = {
    all: rows.length,
    applied: rows.filter((r) => r.status === 'applied').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
  }

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Ιστορικό ανανεώσεων', 'Top-up history')}</h1>
        <p className="text-ink-soft mt-2 text-[15px]">{L('Πότε κάθε voucher ανανεώθηκε, με τι αποτέλεσμα. Πηγή: benefit_topups.', 'When each voucher was refreshed and the outcome. Source: benefit_topups.')}</p>
      </div>

      <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5 w-fit">
        {(['all', 'applied', 'failed', 'skipped'] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium transition ${filter === k ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
            {k === 'all' ? L('Όλα', 'All') : k === 'applied' ? L('Εφαρμοσμένα', 'Applied') : k === 'failed' ? L('Αποτυχημένα', 'Failed') : L('Παράβλεψη', 'Skipped')}
            <span className="num text-ink-faint ml-1">{counts[k]}</span>
          </button>
        ))}
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && rows.length === 0 && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {shown.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="history" /></div>
          <div className="font-display text-[20px] font-semibold">{L('Καμία ανανέωση ακόμη', 'No top-up runs yet')}</div>
          <p className="text-[13px] text-ink-soft mt-1">{L('Όταν τρέξει το cf-topups, οι ενέργειες εμφανίζονται εδώ.', 'When cf-topups runs, the actions will appear here.')}</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-bg/40 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                <th className="px-5 py-3">{L('Όταν', 'When')}</th>
                <th className="px-5 py-3">{L('Παροχή', 'Benefit')}</th>
                <th className="px-5 py-3">{L('Υπάλληλος', 'Employee')}</th>
                <th className="px-5 py-3">{L('Κωδικός voucher', 'Voucher')}</th>
                <th className="px-5 py-3 text-right">{L('Ποσό', 'Amount')}</th>
                <th className="px-5 py-3">{L('Κατάσταση', 'Status')}</th>
                <th className="px-5 py-3">{L('Σφάλμα', 'Error')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => {
                const tone = r.status === 'applied' ? 'success' : r.status === 'failed' ? 'danger' : r.status === 'skipped' ? 'neutral' : 'accent'
                return (
                  <tr key={r.id} className="hover:bg-brand-soft/20">
                    <td className="px-5 py-3 font-mono text-[12px]">{r.applied_at ? new Date(r.applied_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB') : r.scheduled_for}</td>
                    <td className="px-5 py-3 truncate">{lang === 'el' ? r.benefits?.name_el : r.benefits?.name_en}</td>
                    <td className="px-5 py-3 truncate">{r.employees?.display_name ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-ink-soft">{r.gonnaorder_voucher_code ?? '—'}</td>
                    <td className="px-5 py-3 text-right num">{r.amount > 0 ? moneyFull(r.amount, lang) : '—'}</td>
                    <td className="px-5 py-3"><Pill tone={tone}>{r.status}</Pill></td>
                    <td className="px-5 py-3 text-[11.5px] text-danger font-mono max-w-[280px] truncate" title={r.error_detail ?? ''}>{r.error_detail ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
