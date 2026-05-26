import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, FormSection, Field, Pill, txtInputCls } from '../../lib/specui'

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
  const [dirty, setDirty] = useState(false)
  const touch = () => { setDirty(true); setSaved(false) }

  async function load() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-company?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json()
      setCompany(d.company); setOffices(d.offices ?? [])
      setName(d.company?.name ?? ''); setVat(d.company?.vat_number ?? ''); setBilling(d.company?.billing_email ?? '')
      setDirty(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, selectedId])

  async function save() {
    if (!token || !selectedId) return
    if (!name.trim()) { setFormErr(L('Η επωνυμία είναι υποχρεωτική', 'Name is required')); return }
    if (billing && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing)) { setFormErr(L('Μη έγκυρο email τιμολόγησης', 'Invalid billing email')); return }
    setSaving(true); setFormErr(null); setSaved(false)
    try {
      const r = await fetch('/api/cf-company', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: selectedId, name, vat_number: vat, billing_email: billing }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setCompany(d.company); setSaved(true); setDirty(false); setTimeout(() => setSaved(false), 2500)
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <>
      <section className="p-8 space-y-6 max-w-[820px] pb-40">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Στοιχεία εταιρείας', 'Company profile')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Όνομα, ΑΦΜ και billing που εμφανίζονται σε τιμολόγια και αναφορές.', 'Name, VAT, and billing details shown on invoices and reports.')}</p>
        </div>

        {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
        {loading ? (
          <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
        ) : company && (
          <>
            <FormSection title={L('Βασικά στοιχεία', 'Basic info')} sub={L('Εμφανίζονται στο header της εφαρμογής.', 'Shown in the app header.')}>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label={L('Όνομα εταιρείας', 'Company name')}>
                  <input className={txtInputCls} value={name} onChange={(e) => { setName(e.target.value); touch() }} placeholder="Acme A.E." />
                </Field>
                <Field label={L('ΑΦΜ', 'VAT number')}>
                  <input className={txtInputCls + ' font-mono'} value={vat} onChange={(e) => { setVat(e.target.value); touch() }} placeholder="801234567" />
                </Field>
              </div>
              <div className="mt-4">
                <Field label={L('Κατάσταση', 'Status')}>
                  <Pill tone={company.status === 'active' ? 'success' : 'neutral'}>{company.status}</Pill>
                </Field>
              </div>
            </FormSection>

            <FormSection title={L('Τιμολόγηση', 'Billing')} sub={L('Email για αποστολή τιμολογίων και οικονομικών αναφορών.', 'Email where invoices and financial reports arrive.')}>
              <Field label={L('Email τιμολόγησης', 'Billing email')} hint={L('Λαμβάνει τιμολόγια από τους συνεργάτες σας.', 'Receives invoices from your vendors.')}>
                <input className={txtInputCls} type="email" value={billing} onChange={(e) => { setBilling(e.target.value); touch() }} placeholder="billing@acme.gr" />
              </Field>
            </FormSection>

            <FormSection title={L('Γραφεία', 'Offices')} sub={L('Διευθύνσεις παραλαβής που εμφανίζονται στους εργαζόμενους.', 'Pickup addresses shown to employees.')}>
              {offices.length === 0 ? (
                <div className="text-[13px] text-ink-faint">{L('Κανένα γραφείο ακόμη', 'No offices yet')}</div>
              ) : (
                <div className="space-y-2">
                  {offices.map((o) => (
                    <div key={o.id} className="flex items-start justify-between gap-3 p-3 border border-line rounded">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded bg-brand-soft text-brand flex items-center justify-center shrink-0"><Icon name="office" /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold text-[14px]">{lang === 'el' ? o.label_el : o.label_en}</div>
                            {o.is_default && <Pill tone="neutral">{L('Προεπιλογή', 'Default')}</Pill>}
                          </div>
                          <div className="text-[12.5px] text-ink-soft mt-0.5">
                            {[o.street, o.area, o.zip].filter(Boolean).join(', ') || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            {formErr && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{formErr}</div>}
            {saved && <div className="rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">{L('Αποθηκεύτηκε ✓', 'Saved ✓')}</div>}
          </>
        )}
      </section>

      {company && (
        <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line">
          <div className="max-w-[820px] px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="text-[12.5px] text-ink-soft">
              {dirty ? <><span className="inline-block w-2 h-2 rounded-full bg-warn mr-2 align-middle"></span><span className="text-[#A37620]">{L('Μη αποθηκευμένες αλλαγές', 'Unsaved changes')}</span></> : L('Όλα αποθηκευμένα.', 'All saved.')}
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="primary" size="md" disabled={saving || !dirty} onClick={save}>
                <Icon name="check" /><span>{saving ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση', 'Save changes')}</span>
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
