import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'

type Employee = {
  id: string; display_name: string; email: string | null
  external_ref: string | null; status: string
}

export default function EmployeesPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)

  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [voucher, setVoucher] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const token = session?.access_token

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-employees?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json(); setRows(d.employees ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedId) return
    setSaving(true); setFormErr(null)
    try {
      const r = await fetch('/api/cf-employees', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, display_name: name, email, external_ref: voucher }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setName(''); setEmail(''); setVoucher('')
      await load()
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed to add') }
    finally { setSaving(false) }
  }

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">{L('Υπάλληλοι', 'Employees')}</h1>
      <p className="mb-6 text-sm text-ink-soft">{rows.length} {L('εγγραφές', 'records')}</p>

      {/* Add form */}
      <form onSubmit={addEmployee} className="mb-6 rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 font-medium text-ink">{L('Προσθήκη υπαλλήλου', 'Add employee')}</div>
        <div className="grid gap-3 md:grid-cols-4">
          <input className={input} placeholder={L('Ονοματεπώνυμο', 'Full name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <input className={input} type="email" placeholder="email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} placeholder={L('Κωδικός voucher', 'Voucher code')} value={voucher} onChange={(e) => setVoucher(e.target.value)} />
          <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
            {saving ? L('Αποθήκευση…', 'Saving…') : L('Προσθήκη', 'Add')}
          </button>
        </div>
        {formErr && <div className="mt-2 text-sm text-danger">{formErr}</div>}
        <p className="mt-2 text-xs text-ink-faint">{L('Ο κωδικός voucher συνδέει τις παραγγελίες GonnaOrder με τον υπάλληλο.', 'The voucher code links GonnaOrder orders to the employee.')}</p>
      </form>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}
      {loading ? <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-faint">
              <th className="px-4 py-2">{L('Ονοματεπώνυμο', 'Name')}</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">{L('Voucher', 'Voucher')}</th>
              <th className="px-4 py-2">{L('Κατάσταση', 'Status')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink">{r.display_name}</td>
                  <td className="px-4 py-2 text-ink-soft">{r.email ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{r.external_ref ?? '—'}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{r.status}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-faint">{L('Κανένας υπάλληλος ακόμη', 'No employees yet')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
