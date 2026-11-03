import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, FormSection, Field, Pill, txtInputCls, ErrorBanner, friendlyError } from '../../lib/specui'

type Company = { id: string; name: string; vat_number: string | null; billing_email: string | null; status: string }
type Office = { id: string; label_el: string; label_en: string; street: string | null; area: string | null; zip: string | null; is_default: boolean }

// Draft shape — same fields as Office minus id. Used for both create and edit.
type OfficeDraft = { label_el: string; label_en: string; street: string; area: string; zip: string; is_default: boolean }
const emptyDraft = (): OfficeDraft => ({ label_el: '', label_en: '', street: '', area: '', zip: '', is_default: false })

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

  // Office edit state: null = closed; '' = creating a new one; <id> = editing existing.
  const [officeEditing, setOfficeEditing] = useState<string | null>(null)
  const [officeDraft, setOfficeDraft] = useState<OfficeDraft>(emptyDraft())
  const [officeBusy, setOfficeBusy] = useState(false)
  const [officeErr, setOfficeErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

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
    } catch (e) { setError(friendlyError(e, lang)) }
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

  // ── Office CRUD actions ────────────────────────────────────────────────
  function openCreate() {
    setOfficeEditing(''); setOfficeDraft(emptyDraft()); setOfficeErr(null)
  }
  function openEdit(o: Office) {
    setOfficeEditing(o.id)
    setOfficeDraft({
      label_el: o.label_el, label_en: o.label_en,
      street: o.street ?? '', area: o.area ?? '', zip: o.zip ?? '',
      is_default: o.is_default,
    })
    setOfficeErr(null)
  }
  function cancelOffice() { setOfficeEditing(null); setOfficeErr(null) }

  async function saveOffice() {
    if (!token || !selectedId) return
    if (!officeDraft.label_el.trim()) { setOfficeErr(L('Το όνομα είναι υποχρεωτικό', 'Label is required')); return }
    setOfficeBusy(true); setOfficeErr(null)
    try {
      const isNew = officeEditing === ''
      const body = {
        ...(isNew ? { companyId: selectedId } : { officeId: officeEditing }),
        label_el: officeDraft.label_el,
        label_en: officeDraft.label_en || officeDraft.label_el,
        street: officeDraft.street,
        area: officeDraft.area,
        zip: officeDraft.zip,
        is_default: officeDraft.is_default,
      }
      const r = await fetch('/api/cf-company?scope=office', {
        method: isNew ? 'POST' : 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setOfficeEditing(null)
      await load()
    } catch (e) { setOfficeErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setOfficeBusy(false) }
  }

  async function setDefault(o: Office) {
    if (!token || o.is_default) return
    setOfficeBusy(true); setOfficeErr(null)
    try {
      const r = await fetch('/api/cf-company?scope=office', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ officeId: o.id, is_default: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      await load()
    } catch (e) { setOfficeErr(e instanceof Error ? e.message : 'Failed to set default') }
    finally { setOfficeBusy(false) }
  }

  async function doDelete(id: string) {
    if (!token) return
    setOfficeBusy(true); setOfficeErr(null)
    try {
      const r = await fetch(`/api/cf-company?scope=office&officeId=${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setConfirmDel(null)
      await load()
    } catch (e) { setOfficeErr(e instanceof Error ? e.message : 'Failed to delete') }
    finally { setOfficeBusy(false) }
  }

  const dTouch = (patch: Partial<OfficeDraft>) => setOfficeDraft((d) => ({ ...d, ...patch }))

  return (
    <>
      <section className="p-4 md:p-8 space-y-6 max-w-[820px] pb-40">
        <div>
          <h1 className="font-display text-[26px] leading-[32px] sm:text-[36px] sm:leading-[44px] font-semibold">{L('Στοιχεία εταιρείας', 'Company profile')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Όνομα, ΑΦΜ και billing που εμφανίζονται σε τιμολόγια και αναφορές.', 'Name, VAT, and billing details shown on invoices and reports.')}</p>
        </div>

        {error && <ErrorBanner message={error} onRetry={() => void load()} lang={lang} />}
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
              {officeErr && <div className="mb-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{officeErr}</div>}
              {offices.length === 0 && officeEditing === null ? (
                <div className="text-[13px] text-ink-faint">{L('Κανένα γραφείο ακόμη', 'No offices yet')}</div>
              ) : (
                <div className="space-y-2">
                  {offices.map((o) => (
                    <div key={o.id}>
                      {officeEditing === o.id ? (
                        <OfficeForm draft={officeDraft} onChange={dTouch} onCancel={cancelOffice} onSave={saveOffice} busy={officeBusy} L={L} />
                      ) : (
                        <div className="flex items-start justify-between gap-3 p-3 border border-line rounded">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!o.is_default && (
                              <button
                                onClick={() => void setDefault(o)}
                                disabled={officeBusy}
                                className="text-[12px] text-ink-soft hover:text-brand px-2 py-1 rounded hover:bg-brand-soft/40 disabled:opacity-50"
                                title={L('Ορισμός ως προεπιλογή', 'Set as default')}
                              >
                                {L('Προεπιλογή', 'Default')}
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(o)}
                              disabled={officeBusy}
                              className="text-[12px] text-ink-soft hover:text-ink px-2 py-1 rounded hover:bg-bg disabled:opacity-50"
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              onClick={() => setConfirmDel(o.id)}
                              disabled={officeBusy}
                              className="text-[12px] text-ink-soft hover:text-danger px-2 py-1 rounded hover:bg-danger/5 disabled:opacity-50"
                            >
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                      )}
                      {confirmDel === o.id && (
                        <div className="mt-1 flex items-center justify-between gap-3 p-2.5 border border-danger/40 bg-danger/5 rounded">
                          <div className="text-[12.5px] text-danger">{L('Διαγραφή γραφείου;', 'Delete this office?')}</div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setConfirmDel(null)} className="text-[12px] px-2 py-1 rounded border border-line bg-surface hover:bg-bg">{L('Άκυρο', 'Cancel')}</button>
                            <button onClick={() => void doDelete(o.id)} disabled={officeBusy} className="text-[12px] px-2 py-1 rounded bg-danger text-white hover:bg-danger/90 disabled:opacity-50">{L('Διαγραφή', 'Delete')}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Create form inline */}
                  {officeEditing === '' && (
                    <OfficeForm draft={officeDraft} onChange={dTouch} onCancel={cancelOffice} onSave={saveOffice} busy={officeBusy} L={L} />
                  )}
                </div>
              )}
              {officeEditing === null && (
                <div className="mt-3">
                  <Btn variant="ghost" size="sm" onClick={openCreate}>
                    <Icon name="plus" /><span>{L('Προσθήκη γραφείου', 'Add office')}</span>
                  </Btn>
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

// Inline office editor form — used for both create and edit paths.
function OfficeForm({
  draft, onChange, onCancel, onSave, busy, L,
}: {
  draft: OfficeDraft
  onChange: (p: Partial<OfficeDraft>) => void
  onCancel: () => void
  onSave: () => void
  busy: boolean
  L: (el: string, en: string) => string
}) {
  return (
    <div className="p-3 border border-brand/40 bg-brand-soft/30 rounded space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <Field label={L('Όνομα (EL)', 'Label (EL)')}>
          <input className={txtInputCls} value={draft.label_el} onChange={(e) => onChange({ label_el: e.target.value })} placeholder="Κεντρικά γραφεία" />
        </Field>
        <Field label={L('Όνομα (EN)', 'Label (EN)')}>
          <input className={txtInputCls} value={draft.label_en} onChange={(e) => onChange({ label_en: e.target.value })} placeholder="HQ" />
        </Field>
      </div>
      <div className="grid md:grid-cols-[2fr_1fr_1fr] gap-3">
        <Field label={L('Οδός', 'Street')}>
          <input className={txtInputCls} value={draft.street} onChange={(e) => onChange({ street: e.target.value })} placeholder="Λεωφ. Κηφισίας 123" />
        </Field>
        <Field label={L('Περιοχή', 'Area')}>
          <input className={txtInputCls} value={draft.area} onChange={(e) => onChange({ area: e.target.value })} placeholder="Μαρούσι" />
        </Field>
        <Field label={L('ΤΚ', 'ZIP')}>
          <input className={txtInputCls + ' font-mono'} value={draft.zip} onChange={(e) => onChange({ zip: e.target.value })} placeholder="15125" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft cursor-pointer select-none">
        <input type="checkbox" checked={draft.is_default} onChange={(e) => onChange({ is_default: e.target.checked })} />
        <span>{L('Ορισμός ως προεπιλογή', 'Set as default office')}</span>
      </label>
      <div className="flex items-center justify-end gap-2">
        <Btn variant="ghost" size="sm" onClick={onCancel} disabled={busy}>{L('Άκυρο', 'Cancel')}</Btn>
        <Btn variant="primary" size="sm" onClick={onSave} disabled={busy}>
          <Icon name="check" /><span>{busy ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση', 'Save')}</span>
        </Btn>
      </div>
    </div>
  )
}
