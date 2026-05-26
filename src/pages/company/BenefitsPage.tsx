import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, moneyFull } from '../../lib/specui'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'one_time'
type Rule = { topup_cadence: Cadence; carryover: string }
type Benefit = {
  id: string; name_el: string; name_en: string
  credit_amount: number; status: string; valid_from: string; valid_to: string | null
  benefit_rules: Rule[] | Rule | null; assigned_count?: number
}

const ruleOf = (b: Benefit): Rule | null =>
  Array.isArray(b.benefit_rules) ? (b.benefit_rules[0] ?? null) : b.benefit_rules

// Best-effort "next top-up" date from cadence (anchor persistence lands w/ mig 16).
function nextTopup(cadence: Cadence | undefined, validFrom: string): string | null {
  const now = new Date()
  if (cadence === 'one_time' || !cadence) return validFrom || null
  if (cadence === 'daily') { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
  if (cadence === 'weekly') { const d = new Date(now); const add = ((1 - d.getDay()) + 7) % 7 || 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10) }
  // monthly → 1st of next month
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return d.toISOString().slice(0, 10)
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
  const [tab, setTab] = useState<'active' | 'archived'>('active')

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

  async function setStatus(id: string, status: 'active' | 'archived') {
    if (!token) return
    const verb = status === 'archived' ? L('Αρχειοθέτηση', 'Archive') : L('Επαναφορά', 'Reactivate')
    if (!confirm(`${verb}?`)) return
    const r = await fetch('/api/cf-benefits', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (r.ok) setRows((rs) => rs.map((b) => (b.id === id ? { ...b, status } : b)))
  }

  const cadenceLabel: Record<Cadence, string> = {
    monthly: L('κάθε μήνα', 'every month'), weekly: L('κάθε εβδομάδα', 'every week'),
    daily: L('καθημερινά', 'every day'), one_time: L('μία φορά', 'one-off'),
  }
  const typeLabel: Record<Cadence, string> = {
    monthly: L('Μηνιαία επιδότηση', 'Monthly allowance'), weekly: L('Εβδομαδιαία πίστωση', 'Weekly credit'),
    daily: L('Ημερήσια πίστωση', 'Daily credit'), one_time: L('Μία φορά', 'One-off'),
  }

  const active = rows.filter((b) => b.status === 'active')
  const archived = rows.filter((b) => b.status !== 'active')
  const shown = tab === 'active' ? active : archived

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Παροχές', 'Benefits')}</h1>
          <p className="text-ink-soft mt-2 text-[15px] max-w-xl">{L('Ρυθμίστε τι λαμβάνουν οι εργαζόμενοι και πού.', 'Configure what your employees get and where.')}</p>
        </div>
        <Link to="/company/benefits/new">
          <Btn variant="primary" size="lg"><Icon name="plus" /><span>{L('Νέα παροχή', 'New benefit')}</span></Btn>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5">
          <button onClick={() => setTab('active')} className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium ${tab === 'active' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
            {L('Ενεργές', 'Active')} <span className="num text-ink-faint ml-1">{active.length}</span>
          </button>
          <button onClick={() => setTab('archived')} className={`px-3 py-1.5 rounded-xs text-[12.5px] font-medium ${tab === 'archived' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>
            {L('Αρχειοθ.', 'Archived')} <span className="num text-ink-faint ml-1">{archived.length}</span>
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading ? (
        <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="wallet" /></div>
          <div className="font-display text-[20px] font-semibold">{tab === 'active' ? L('Καμία παροχή ακόμη', 'No benefits yet') : L('Καμία αρχειοθετημένη', 'Nothing archived')}</div>
          {tab === 'active' && (
            <>
              <p className="text-[13.5px] text-ink-soft mt-1">{L('Δημιουργήστε την πρώτη σας παροχή για να ξεκινήσετε.', 'Create your first benefit to get started.')}</p>
              <div className="mt-4 inline-block"><Link to="/company/benefits/new"><Btn variant="primary" size="md"><Icon name="plus" /><span>{L('Νέα παροχή', 'New benefit')}</span></Btn></Link></div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shown.map((b) => {
            const rule = ruleOf(b)
            const cad = rule?.topup_cadence
            const nt = nextTopup(cad, b.valid_from)
            return (
              <div key={b.id} className="group bg-surface border border-line rounded-md shadow-sm p-5 hover:border-ink-soft transition relative">
                {/* Archive / reactivate (visible on hover, top-right) */}
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void setStatus(b.id, b.status === 'active' ? 'archived' : 'active') }}
                  title={b.status === 'active' ? L('Αρχειοθέτηση', 'Archive') : L('Επαναφορά', 'Reactivate')}
                  className="absolute top-3 right-3 w-7 h-7 rounded text-ink-faint hover:text-ink hover:bg-bg flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10">
                  <Icon name={b.status === 'active' ? 'x' : 'check'} size={14} />
                </button>
                <Link to={`/company/benefits/${b.id}`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                      <span className={`w-2 h-2 rounded-full ${b.status === 'active' ? 'bg-success' : 'bg-ink-faint'}`}></span>
                      {cad ? typeLabel[cad] : '—'}
                      {rule?.carryover === 'accumulate' && (
                        <><span className="text-ink-faint">·</span><span className="text-[#A37620] normal-case tracking-normal">{L('συσσώρευση', 'carryover')}</span></>
                      )}
                    </div>
                    <h3 className="font-display text-[22px] font-semibold mt-1.5 truncate">{lang === 'el' ? b.name_el : b.name_en}</h3>
                  </div>
                  <span className="text-ink-faint group-hover:text-ink transition shrink-0 mt-2"><Icon name="chevron_r" /></span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-[32px] font-semibold num">{moneyFull(b.credit_amount, lang)}</span>
                  <span className="text-[13px] text-ink-soft">{cad ? cadenceLabel[cad] : ''}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 gap-4 text-[12.5px]">
                  <div>
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Ανατίθεται σε', 'Assigned to')}</div>
                    <div className="font-semibold mt-0.5">{b.assigned_count ?? 0} <span className="text-ink-soft font-normal">{L('υπαλλήλους', 'employees')}</span></div>
                  </div>
                  <div>
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Επόμενη ανανέωση', 'Next top-up')}</div>
                    <div className="font-mono text-[12.5px] mt-0.5">{nt ? new Date(nt + 'T00:00:00').toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                  </div>
                </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
