import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, Pill, FormSection, Field, txtInputCls } from '../../lib/specui'

type Employee = { id: string; display_name: string; email: string | null; external_ref: string | null; status: string; office: { label_el: string | null; label_en: string | null } | null }
type Home = { employee: Employee }

export default function EmployeeProfilePage() {
  const { session, user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [data, setData] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token) return
    ;(async () => {
      try {
        const r = await fetch('/api/cf-employee-home', { headers: { authorization: `Bearer ${session.access_token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        setData(await r.json())
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [session?.access_token])

  const e = data?.employee
  const initials = (e?.display_name || user?.email || 'U').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()
  const office = e ? (lang === 'el' ? e.office?.label_el : e.office?.label_en) : null

  return (
    <section className="p-8 max-w-[820px] mx-auto space-y-6">
      <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Το προφίλ μου', 'My profile')}</h1>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {e && (
        <>
          <div className="bg-surface border border-line rounded-md shadow-sm p-6 flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-brand text-white flex items-center justify-center text-[28px] font-display font-semibold">{initials}</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-[24px] font-semibold truncate">{e.display_name}</h2>
              <div className="text-[13.5px] text-ink-soft truncate">{e.email || '—'}</div>
              {office && <div className="text-[12px] text-ink-faint mt-1">{office}</div>}
            </div>
            <Pill tone={e.status === 'active' ? 'success' : 'neutral'}>{e.status}</Pill>
          </div>

          <FormSection title={L('Στοιχεία', 'Details')} sub={L('Διαχειρίζονται από τον admin της εταιρείας σας.', 'Managed by your company admin.')}>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label={L('Ονοματεπώνυμο', 'Full name')}>
                <input className={txtInputCls + ' bg-bg/50'} value={e.display_name} disabled />
              </Field>
              <Field label="Email">
                <input className={txtInputCls + ' bg-bg/50'} value={e.email || ''} disabled />
              </Field>
              <Field label={L('Κωδικός voucher', 'Voucher code')}>
                <input className={txtInputCls + ' bg-bg/50 font-mono'} value={e.external_ref || ''} disabled />
              </Field>
              <Field label={L('Γραφείο', 'Office')}>
                <input className={txtInputCls + ' bg-bg/50'} value={office || ''} disabled />
              </Field>
            </div>
            <p className="text-[12px] text-ink-faint mt-3">{L('Για αλλαγές, επικοινωνήστε με τον admin της εταιρείας σας.', 'For changes, contact your company admin.')}</p>
          </FormSection>

          <FormSection title={L('Προτιμήσεις', 'Preferences')} sub={L('Γλώσσα της εφαρμογής.', 'App language.')}>
            <div className="flex gap-2">
              {(['el', 'en'] as const).map((c) => (
                <button key={c} onClick={() => setLang(c)}
                  className={`px-4 h-10 border rounded text-[13px] font-medium transition ${lang === c ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-soft hover:text-ink'}`}>
                  {c === 'el' ? 'Ελληνικά' : 'English'}
                </button>
              ))}
            </div>
          </FormSection>

          <div className="flex justify-end">
            <Btn variant="danger" size="md" onClick={() => void signOut()}><Icon name="logout" /><span>{L('Αποσύνδεση', 'Sign out')}</span></Btn>
          </div>
        </>
      )}
    </section>
  )
}
