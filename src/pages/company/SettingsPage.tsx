import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'

type Company = { id: string; name: string; vat_number: string | null; billing_email: string | null; status: string }
type Office = { id: string; label_el: string; label_en: string; street: string | null; area: string | null; zip: string | null; is_default: boolean }

export default function SettingsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [company, setCompany] = useState<Company | null>(null)
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [vat, setVat] = useState('')
  const [billing, setBilling] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-company?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json()
      setCompany(d.company); setOffices(d.offices ?? [])
      setName(d.company?.name ?? ''); setVat(d.company?.vat_number ?? ''); setBilling(d.company?.billing_email ?? '')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !selectedId) return
    setSaving(true); setFormErr(null); setSaved(false)
    try {
      const r = await fetch('/api/cf-company', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, name, vat_number: vat, billing_email: billing }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setCompany(d.company); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">{L('Ρυθμίσεις', 'Settings')}</h1>
      <p className="mb-6 text-sm text-ink-soft">{L('Στοιχεία εταιρείας & γραφεία', 'Company profile & offices')}</p>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}
      {loading ? <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div> : company && (
        <div className="grid gap-6">
          <form onSubmit={save} className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 font-display text-lg font-semibold text-ink">{L('Στοιχεία εταιρείας', 'Company profile')}</div>
            <div className="grid gap-4">
              <label className="text-sm text-ink-soft">{L('Επωνυμία', 'Name')}
                <input className={input + ' mt-1'} value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="text-sm text-ink-soft">{L('ΑΦΜ', 'VAT number')}
                <input className={input + ' mt-1'} value={vat} onChange={(e) => setVat(e.target.value)} placeholder="—" />
              </label>
              <label className="text-sm text-ink-soft">{L('Email τιμολόγησης', 'Billing email')}
                <input className={input + ' mt-1'} type="email" value={billing} onChange={(e) => setBilling(e.target.value)} placeholder="—" />
              </label>
            </div>
            {formErr && <div className="mt-3 text-sm text-danger">{formErr}</div>}
            <div className="mt-4 flex items-center gap-3">
              <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
                {saving ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση', 'Save')}
              </button>
              {saved && <span className="text-sm text-success">{L('Αποθηκεύτηκε ✓', 'Saved ✓')}</span>}
            </div>
          </form>

          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 font-display text-lg font-semibold text-ink">{L('Γραφεία', 'Offices')}</div>
            <div className="grid gap-3">
              {offices.map((o) => (
                <div key={o.id} className="flex items-start justify-between rounded-lg border border-line bg-bg p-3">
                  <div>
                    <div className="font-medium text-ink">{lang === 'el' ? o.label_el : o.label_en} {o.is_default && <span className="ml-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{L('προεπιλογή', 'default')}</span>}</div>
                    <div className="text-sm text-ink-soft">{[o.street, o.area, o.zip].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                </div>
              ))}
              {offices.length === 0 && <div className="text-sm text-ink-faint">{L('Κανένα γραφείο', 'No offices')}</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
