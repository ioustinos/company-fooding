import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, Pill, FormSection, Field, txtInputCls } from '../../lib/specui'

type Group = { id: string; code: string; name_el: string; name_en: string; status: 'active' | 'archived'; is_system: boolean; people?: number }

export default function GroupsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rows, setRows] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // create form
  const [code, setCode] = useState('')
  const [nameEl, setNameEl] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-groups?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json(); setRows(d.groups ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  async function createGroup() {
    if (!token || !selectedId) return
    if (!code.trim() || !nameEl.trim() || !nameEn.trim()) { setFormErr(L('Συμπληρώστε όλα τα πεδία', 'Fill in all fields')); return }
    setSaving(true); setFormErr(null)
    try {
      const r = await fetch('/api/cf-groups', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, code: code.toUpperCase(), name_el: nameEl, name_en: nameEn }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setCode(''); setNameEl(''); setNameEn(''); setShowForm(false); await load()
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  async function archive(g: Group) {
    if (!token || g.is_system) return
    if (!confirm(L(`Αρχειοθέτηση ομάδας "${g.code}";`, `Archive group "${g.code}"?`))) return
    const r = await fetch('/api/cf-groups', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: g.id }),
    })
    if (r.ok) await load()
  }

  const filtered = rows.filter((g) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return g.code.toLowerCase().includes(q) || g.name_el.toLowerCase().includes(q) || g.name_en.toLowerCase().includes(q)
  })

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Ομάδες', 'Groups')}</h1>
          <p className="text-ink-soft mt-2 text-[15px] max-w-xl">{L('Οργανώστε υπαλλήλους σε ομάδες (Engineering, Sales, …) για να αναθέτετε παροχές μαζικά.', 'Organize employees into groups (Engineering, Sales, …) to assign benefits in bulk.')}</p>
        </div>
        <Btn variant="primary" size="md" onClick={() => setShowForm((s) => !s)}>
          <Icon name="plus" /><span>{showForm ? L('Κλείσιμο', 'Close') : L('Νέα ομάδα', 'New group')}</span>
        </Btn>
      </div>

      {showForm && (
        <FormSection title={L('Νέα ομάδα', 'New group')} sub={L('Ο κωδικός χρησιμοποιείται στο CSV import.', 'The code is used in CSV imports.')}>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label={L('Κωδικός', 'Code')} hint={L('Σύντομος, με κεφαλαία (π.χ. ENG)', 'Short, uppercase (e.g. ENG)')}>
              <input className={txtInputCls + ' font-mono uppercase'} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ENG" />
            </Field>
            <Field label={L('Όνομα (EL)', 'Name (EL)')}>
              <input className={txtInputCls} value={nameEl} onChange={(e) => setNameEl(e.target.value)} placeholder="Μηχανικοί" />
            </Field>
            <Field label={L('Όνομα (EN)', 'Name (EN)')}>
              <input className={txtInputCls} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Engineering" />
            </Field>
          </div>
          {formErr && <div className="mt-3 text-sm text-danger">{formErr}</div>}
          <div className="mt-4">
            <Btn variant="primary" size="md" disabled={saving} onClick={createGroup}>
              <Icon name="check" /><span>{saving ? L('Αποθήκευση…', 'Saving…') : L('Δημιουργία', 'Create')}</span>
            </Btn>
          </div>
        </FormSection>
      )}

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="bg-surface border border-line rounded-md shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-line">
          <div className="text-[12.5px] text-ink-soft"><span className="num font-semibold">{filtered.length}</span> {L('ομάδες', 'groups')}</div>
          <div className="max-w-xs relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L('Αναζήτηση ομάδας ή κωδικού…', 'Search group or code…')}
              className="w-full h-9 pl-9 pr-3 bg-bg border border-line rounded-xs text-[13px]" />
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-ink-faint">{L('Καμία ομάδα', 'No groups')}</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-bg/40 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                <th className="px-5 py-3">{L('Ομάδα', 'Group')}</th>
                <th className="px-5 py-3">{L('Κωδικός', 'Code')}</th>
                <th className="px-5 py-3 text-right">{L('Άτομα', 'People')}</th>
                <th className="px-5 py-3">{L('Κατάσταση', 'Status')}</th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((g) => (
                <tr key={g.id} className={`hover:bg-brand-soft/20 ${g.status === 'archived' ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center text-[11.5px] font-semibold num">{g.code}</div>
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-2">
                          {lang === 'el' ? g.name_el : g.name_en}
                          {g.is_system && <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] bg-bg border border-line text-ink-faint px-1.5 py-0.5 rounded-xs">{L('σύστημα', 'system')}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 num text-[12.5px] text-ink-soft">{g.code}</td>
                  <td className="px-5 py-3.5 num text-right font-medium">{g.people ?? 0}</td>
                  <td className="px-5 py-3.5"><Pill tone={g.status === 'active' ? 'success' : 'neutral'}>{g.status === 'active' ? L('Ενεργή', 'Active') : L('Αρχειοθ.', 'Archived')}</Pill></td>
                  <td className="px-5 py-3.5 text-right">
                    {!g.is_system && g.status === 'active' && (
                      <button onClick={() => void archive(g)} className="text-ink-faint hover:text-danger" title={L('Αρχειοθέτηση', 'Archive')}>
                        <Icon name="x" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-md bg-accent-soft/50 border border-accent/20 p-4 text-[13px] text-ink-soft leading-[20px]">
        <b className="text-ink">{L('Υπόδειξη', 'Tip')}.</b> {L('Οι κωδικοί ομάδας (π.χ. ENG, SALES) μπορούν να χρησιμοποιηθούν στο CSV import. Η ομάδα ', 'Group codes (e.g. ENG, SALES) can be used in CSV import. The ')}<span className="num font-semibold">ALL</span>{L(' υπάρχει πάντα και περιέχει όλους τους ενεργούς εργαζόμενους.', ' group is always present and contains every active employee.')}
      </div>
    </section>
  )
}
