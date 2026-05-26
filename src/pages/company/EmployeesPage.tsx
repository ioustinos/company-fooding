import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, Pill, moneyFull } from '../../lib/specui'

type Employee = {
  id: string; display_name: string; email: string | null
  external_ref: string | null; status: string
  group_id: string | null
  office_label_el: string | null; office_label_en: string | null
  benefits_count: number; spend: number
}

type StatusTab = 'all' | 'active' | 'invited' | 'inactive'

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '·'

export default function EmployeesPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const navigate = useNavigate()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'spend' | 'benefits'>('name')

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

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { all: rows.length, active: 0, invited: 0, inactive: 0 }
    for (const r of rows) {
      if (r.status === 'active') c.active++
      else if (r.status === 'invited') c.invited++
      else c.inactive++
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    let r = rows
    if (tab !== 'all') r = r.filter((x) => (tab === 'inactive' ? x.status !== 'active' && x.status !== 'invited' : x.status === tab))
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter((x) => (x.display_name || '').toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q) || (x.external_ref || '').toLowerCase().includes(q))
    }
    const arr = [...r]
    if (sortBy === 'spend') arr.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    else if (sortBy === 'benefits') arr.sort((a, b) => (b.benefits_count ?? 0) - (a.benefits_count ?? 0))
    else arr.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))
    return arr
  }, [rows, tab, search, sortBy])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Υπάλληλοι', 'Employees')}</h1>
          <p className="text-ink-soft mt-2 text-[15px] max-w-xl">{L('Όσοι λαμβάνουν παροχές από την εταιρεία σας.', 'Everyone receiving a benefit from your company.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/company/employees/new?mode=csv">
            <Btn variant="secondary" size="md"><Icon name="file" /><span>{L('Εισαγωγή CSV', 'Import CSV')}</span></Btn>
          </Link>
          <Link to="/company/employees/new">
            <Btn variant="primary" size="md"><Icon name="plus" /><span>{L('Πρόσκληση', 'Invite')}</span></Btn>
          </Link>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-md shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-line flex-wrap">
          <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5">
            {(['all', 'active', 'invited', 'inactive'] as StatusTab[]).map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium transition ${tab === k ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
                {L(k === 'all' ? 'Όλοι' : k === 'active' ? 'Ενεργοί' : k === 'invited' ? 'Προσκεκλημένοι' : 'Ανενεργοί',
                    k === 'all' ? 'All' : k === 'active' ? 'Active' : k === 'invited' ? 'Invited' : 'Inactive')}
                <span className="num text-ink-faint ml-1">{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="max-w-xs relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={L('Αναζήτηση ονόματος, email ή κωδικού…', 'Search name, email, or code…')}
              className="w-full h-10 pl-10 pr-3 bg-bg border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
          </div>
        </div>

        {error && <div className="p-4 text-sm text-danger">{error}</div>}
        {loading ? (
          <div className="p-6 text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="users" /></div>
            <div className="font-display text-[20px] font-semibold">{rows.length === 0 ? L('Κανένας υπάλληλος ακόμη', 'No employees yet') : L('Καμία αντιστοιχία', 'No matches')}</div>
            {rows.length === 0 && (
              <div className="mt-4 inline-flex gap-2">
                <Link to="/company/employees/new"><Btn variant="primary" size="md"><Icon name="plus" /><span>{L('Πρόσκληση', 'Invite')}</span></Btn></Link>
                <Link to="/company/employees/new?mode=csv"><Btn variant="secondary" size="md"><Icon name="file" /><span>{L('Εισαγωγή CSV', 'Import CSV')}</span></Btn></Link>
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="bg-bg/40 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                <th className="px-5 py-3 w-10"><input type="checkbox" className="accent-brand w-4 h-4" /></th>
                <th className="px-5 py-3 cursor-pointer select-none" onClick={() => setSortBy('name')}>{L('Όνομα', 'Name')}{sortBy === 'name' && ' ↓'}</th>
                <th className="px-5 py-3">{L('Γραφείο', 'Office')}</th>
                <th className="px-5 py-3 text-center cursor-pointer select-none" onClick={() => setSortBy('benefits')}>{L('Παροχές', 'Benefits')}{sortBy === 'benefits' && ' ↓'}</th>
                <th className="px-5 py-3 text-right cursor-pointer select-none" onClick={() => setSortBy('spend')}>{L('Χρήση', 'Used')}{sortBy === 'spend' && ' ↓'}</th>
                <th className="px-5 py-3">{L('Κατάσταση', 'Status')}</th>
                <th className="px-5 py-3 w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((e) => {
                const office = lang === 'el' ? e.office_label_el : e.office_label_en
                const status = e.status === 'active' ? 'active' : e.status === 'invited' ? 'invited' : 'inactive'
                const tone = status === 'active' ? 'success' : status === 'invited' ? 'accent' : 'neutral'
                const statusLabel = status === 'active' ? L('Ενεργός', 'Active') : status === 'invited' ? L('Προσκεκλημένος', 'Invited') : L('Ανενεργός', 'Inactive')
                return (
                  <tr key={e.id} className="hover:bg-brand-soft/30 transition cursor-pointer"
                      onClick={(ev) => {
                        if ((ev.target as HTMLElement).closest('input,button,a')) return
                        navigate(`/company/employees/${e.id}`)
                      }}>
                    <td className="px-5 py-3"><input type="checkbox" className="accent-brand w-4 h-4" onClick={(ev) => ev.stopPropagation()} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-soft text-brand flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(e.display_name)}</div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{e.display_name}</div>
                          <div className="text-[12px] text-ink-soft truncate">{e.email || (e.external_ref ? `voucher: ${e.external_ref}` : '—')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-soft text-[13px]">{office || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-xs text-[12px] font-semibold num ${e.benefits_count > 0 ? 'bg-brand-soft text-brand' : 'bg-bg text-ink-faint'}`}>{e.benefits_count ?? 0}</span>
                    </td>
                    <td className={`px-5 py-3 text-right num ${e.spend > 0 ? 'text-ink' : 'text-ink-faint'}`}>{e.spend > 0 ? moneyFull(e.spend, lang) : '—'}</td>
                    <td className="px-5 py-3"><Pill tone={tone}>{statusLabel}</Pill></td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={(ev) => { ev.stopPropagation(); void toggleStatus(e) }} title={e.status === 'active' ? L('Απενεργοποίηση', 'Deactivate') : L('Ενεργοποίηση', 'Activate')}
                        className="text-ink-faint hover:text-ink"><Icon name="chevron_r" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {filtered.length > 0 && (
          <div className="p-4 border-t border-line flex items-center justify-between text-[12.5px] text-ink-soft">
            <span>{L(`Εμφάνιση ${filtered.length} από ${rows.length}`, `Showing ${filtered.length} of ${rows.length}`)}</span>
            <span className="text-ink-faint">{L('Άθροισμα χρήσης:', 'Total used:')} <span className="num text-ink font-semibold ml-1">{moneyFull(filtered.reduce((a, e) => a + (e.spend ?? 0), 0), lang)}</span></span>
          </div>
        )}
      </div>
    </section>
  )
}
