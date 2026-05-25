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
  const token = session?.access_token

  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [voucher, setVoucher] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const [showBulk, setShowBulk] = useState(false)
  const [csv, setCsv] = useState('')
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

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
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setFormErr(L('Μη έγκυρο email', 'Invalid email')); return }
    setSaving(true); setFormErr(null)
    try {
      const r = await fetch('/api/cf-employees', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, display_name: name, email, external_ref: voucher }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setName(''); setEmail(''); setVoucher(''); await load()
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed to add') }
    finally { setSaving(false) }
  }

  async function bulkImport() {
    if (!token || !selectedId) return
    // Parse: each line "name, email, voucher" (email + voucher optional)
    const parsed = csv.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [display_name, em, vc] = line.split(',').map((s) => (s ?? '').trim())
      return { display_name, email: em || undefined, external_ref: vc || undefined }
    }).filter((r) => r.display_name)
    if (parsed.length === 0) { setBulkMsg(L('Καμία έγκυρη γραμμή', 'No valid rows')); return }
    setBulkBusy(true); setBulkMsg(null)
    try {
      const r = await fetch('/api/cf-employees', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, rows: parsed }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      const b = d.bulk
      setBulkMsg(L(`Προστέθηκαν ${b.inserted}, παραλείφθηκαν ${b.skipped} (διπλά)`, `Added ${b.inserted}, skipped ${b.skipped} (duplicates)`) + (b.errors?.length ? ` · ${b.errors.length} errors` : ''))
      setCsv(''); await load()
    } catch (e) { setBulkMsg(e instanceof Error ? e.message : 'Failed') }
    finally { setBulkBusy(false) }
  }

  async function toggleStatus(emp: Employee) {
    if (!token) return
    const next = emp.status === 'active' ? 'inactive' : 'active'
    const r = await fetch('/api/cf-employees', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: emp.id, status: next }),
    })
    if (r.ok) setRows((rs) => rs.map((x) => (x.id === emp.id ? { ...x, status: next } : x)))
  }

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{L('Υπάλληλοι', 'Employees')}</h1>
          <p className="text-sm text-ink-soft">{rows.length} {L('εγγραφές', 'records')}</p>
        </div>
        <button onClick={() => setShowBulk((s) => !s)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface">
          {showBulk ? L('Κλείσιμο', 'Close') : L('Μαζική εισαγωγή', 'Bulk import')}
        </button>
      </div>

      {showBulk && (
        <div className="mb-6 rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 font-medium text-ink">{L('Μαζική εισαγωγή (CSV)', 'Bulk import (CSV)')}</div>
          <p className="mb-2 text-xs text-ink-faint">{L('Μία γραμμή ανά υπάλληλο:', 'One line per employee:')} <code>name, email, voucher</code> {L('(email & voucher προαιρετικά)', '(email & voucher optional)')}</p>
          <textarea className={input + ' h-40 font-mono'} value={csv} onChange={(e) => setCsv(e.target.value)}
            placeholder={'Maria Papadopoulou, maria@queensnav.com, m.papadopoulou\nGiorgos Antoniou, , g.antoniou'} />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => void bulkImport()} disabled={bulkBusy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
              {bulkBusy ? L('Εισαγωγή…', 'Importing…') : L('Εισαγωγή', 'Import')}
            </button>
            {bulkMsg && <span className="text-sm text-ink-soft">{bulkMsg}</span>}
          </div>
        </div>
      )}

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
              <th className="px-4 py-2 text-right">{L('Ενέργειες', 'Actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink">{r.display_name}</td>
                  <td className="px-4 py-2 text-ink-soft">{r.email ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{r.external_ref ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'active' ? 'bg-brand-soft text-brand' : 'bg-bg text-ink-faint'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => void toggleStatus(r)} className="text-xs text-ink-soft underline hover:text-ink">
                      {r.status === 'active' ? L('Απενεργοποίηση', 'Deactivate') : L('Ενεργοποίηση', 'Activate')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-faint">{L('Κανένας υπάλληλος ακόμη', 'No employees yet')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
