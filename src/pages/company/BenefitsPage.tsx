import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { fmtMoney } from '../../lib/helpers'

type Rule = { topup_cadence: string; topup_amount: number; carryover: string }
type Benefit = {
  id: string; name_el: string; name_en: string; credit_amount: number
  status: string; valid_from: string; benefit_rules: Rule[] | Rule | null
}

export default function BenefitsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rows, setRows] = useState<Benefit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [nameEl, setNameEl] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [amount, setAmount] = useState('5.00')
  const [cadence, setCadence] = useState('daily')
  const [carryover, setCarryover] = useState('reset')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-benefits?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json(); setRows(d.benefits ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  async function createBenefit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedId) return
    setSaving(true); setFormErr(null)
    try {
      const r = await fetch('/api/cf-benefits', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedId, name_el: nameEl, name_en: nameEn,
          credit_amount_eur: Number(amount), topup_cadence: cadence, carryover,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setNameEl(''); setNameEn(''); setAmount('5.00')
      await load()
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed to create') }
    finally { setSaving(false) }
  }

  const ruleOf = (b: Benefit): Rule | null => Array.isArray(b.benefit_rules) ? (b.benefit_rules[0] ?? null) : b.benefit_rules
  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">{L('Παροχές', 'Benefits')}</h1>
      <p className="mb-6 text-sm text-ink-soft">{rows.length} {L('παροχές', 'benefits')}</p>

      <form onSubmit={createBenefit} className="mb-6 rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 font-medium text-ink">{L('Νέα παροχή', 'Create benefit')}</div>
        <div className="grid gap-3 md:grid-cols-3">
          <input className={input} placeholder={L('Όνομα (EL)', 'Name (EL)')} value={nameEl} onChange={(e) => setNameEl(e.target.value)} required />
          <input className={input} placeholder={L('Όνομα (EN)', 'Name (EN)')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          <input className={input} type="number" step="0.50" min="0" placeholder={L('Ποσό €', 'Amount €')} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <select className={input} value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="daily">{L('Ημερήσια', 'Daily')}</option>
            <option value="weekly">{L('Εβδομαδιαία', 'Weekly')}</option>
            <option value="monthly">{L('Μηνιαία', 'Monthly')}</option>
            <option value="one_time">{L('Εφάπαξ', 'One-time')}</option>
          </select>
          <select className={input} value={carryover} onChange={(e) => setCarryover(e.target.value)}>
            <option value="reset">{L('Μηδενισμός', 'Reset each cycle')}</option>
            <option value="accumulate">{L('Συσσώρευση', 'Accumulate')}</option>
          </select>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
            {saving ? L('Αποθήκευση…', 'Saving…') : L('Δημιουργία', 'Create')}
          </button>
        </div>
        {formErr && <div className="mt-2 text-sm text-danger">{formErr}</div>}
      </form>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}
      {loading ? <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-faint">
              <th className="px-4 py-2">{L('Όνομα', 'Name')}</th>
              <th className="px-4 py-2 text-right">{L('Ποσό', 'Amount')}</th>
              <th className="px-4 py-2">{L('Συχνότητα', 'Cadence')}</th>
              <th className="px-4 py-2">{L('Carryover', 'Carryover')}</th>
              <th className="px-4 py-2">{L('Από', 'From')}</th>
              <th className="px-4 py-2">{L('Κατάσταση', 'Status')}</th>
            </tr></thead>
            <tbody>
              {rows.map((b) => { const rule = ruleOf(b); return (
                <tr key={b.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink">{lang === 'el' ? b.name_el : b.name_en}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">{fmtMoney(b.credit_amount, lang)}</td>
                  <td className="px-4 py-2 text-ink-soft">{rule?.topup_cadence ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-soft">{rule?.carryover ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-soft">{b.valid_from}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{b.status}</span></td>
                </tr>
              )})}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-faint">{L('Καμία παροχή ακόμη', 'No benefits yet')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
