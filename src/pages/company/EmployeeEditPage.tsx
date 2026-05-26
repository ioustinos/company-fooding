import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, FormSection, Field, Pill, txtInputCls, moneyFull } from '../../lib/specui'

type Mode = 'one' | 'csv'
type Employee = { id: string; display_name: string; email: string | null; external_ref: string | null; status: string; office?: { label_el: string | null; label_en: string | null } | null }
type Assignment = {
  id: string; benefit_id: string; assigned_at: string; gonnaorder_voucher_code: string | null
  benefits: { name_el: string; name_en: string; credit_amount: number; status: string; benefit_rules?: { topup_cadence: string } | { topup_cadence: string }[] | null } | null
}
type Order = { id: string; delivery_date: string | null; subtotal: number; benefit_applied: number; topup_amount: number; vendors: { name: string } | null }

export default function EmployeeEditPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(isEdit ? 'one' : (params.get('mode') === 'csv' ? 'csv' : 'one'))

  // one-person fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [empId, setEmpId] = useState('')
  const [voucher, setVoucher] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [office, setOffice] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [unassigning, setUnassigning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const touch = () => setDirty(true)

  // load existing employee + their assignments + recent orders
  async function loadDetail() {
    if (!token || !isEdit || !id) return
    setLoading(true); setErr(null)
    try {
      const r = await fetch(`/api/cf-employees?id=${id}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json()
      const e = d.employee as Employee
      if (!e) throw new Error(L('Δεν βρέθηκε ο υπάλληλος', 'Employee not found'))
      const parts = (e.display_name || '').split(/\s+/)
      setFirstName(parts[0] || '')
      setLastName(parts.slice(1).join(' '))
      setEmail(e.email || '')
      setEmpId('')
      setVoucher(e.external_ref || '')
      setStatus(e.status === 'active' ? 'active' : 'inactive')
      setOffice(lang === 'el' ? (e.office?.label_el ?? null) : (e.office?.label_en ?? null))
      setAssignments(d.assignments ?? [])
      setOrders(d.orders ?? [])
      setDirty(false)
    } catch (er) { setErr(er instanceof Error ? er.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadDetail() /* eslint-disable-next-line */ }, [token, isEdit, id, lang])

  async function unassign(assignmentId: string) {
    if (!token) return
    setUnassigning(assignmentId)
    try {
      const r = await fetch('/api/cf-benefit-assign', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      setAssignments((arr) => arr.filter((a) => a.id !== assignmentId))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to unassign') }
    finally { setUnassigning(null) }
  }

  // csv
  const [csv, setCsv] = useState('')
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  async function saveOne() {
    if (!token || !selectedId) return
    const name = `${firstName} ${lastName}`.trim()
    if (!name) { setErr(L('Το ονοματεπώνυμο είναι υποχρεωτικό', 'Name is required')); return }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr(L('Μη έγκυρο email', 'Invalid email')); return }
    setSaving(true); setErr(null)
    try {
      const payload = isEdit
        ? { id, display_name: name, email: email || '', external_ref: voucher || empId || '', status }
        : { companyId: selectedId, display_name: name, email: email || undefined, external_ref: voucher || empId || undefined }
      const r = await fetch('/api/cf-employees', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      navigate('/company/employees')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  function downloadSampleCsv() {
    const sample = [
      'display_name,email,employee_id',
      'Μαρία Παπαδοπούλου,maria.p@acme.gr,HR-0001',
      'Γιώργος Αθανασίου,giorgos.a@acme.gr,HR-0002',
      'Νίκος Παππάς,,HR-0042',
    ].join('\n')
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'orexi-employees-sample.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function importCsv() {
    if (!token || !selectedId) return
    const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) { setBulkMsg(L('Καμία γραμμή', 'No rows')); return }
    // skip a header row if it looks like one
    const start = /display_name/i.test(lines[0]) ? 1 : 0
    const parsed = lines.slice(start).map((line) => {
      const [display_name, em, eid] = line.split(',').map((s) => (s ?? '').trim())
      return { display_name, email: em || undefined, external_ref: eid || undefined }
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
      setBulkMsg(L(`Προστέθηκαν ${b.inserted}, παραλείφθηκαν ${b.skipped}`, `Added ${b.inserted}, skipped ${b.skipped}`))
      if (b.inserted > 0) setTimeout(() => navigate('/company/employees'), 800)
    } catch (e) { setBulkMsg(e instanceof Error ? e.message : 'Failed') }
    finally { setBulkBusy(false) }
  }

  return (
    <>
      <section className="p-8 max-w-[860px] pb-0">
        <Link to="/company/employees" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink mb-5">
          <span className="rotate-180"><Icon name="chevron_r" /></span>{L('Υπάλληλοι', 'Employees')}
        </Link>
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-[36px] leading-[44px] font-semibold">
              {isEdit ? `${firstName} ${lastName}`.trim() || L('Επεξεργασία υπαλλήλου', 'Edit employee') : L('Νέος υπάλληλος', 'New employee')}
            </h1>
            <p className="text-ink-soft mt-2 text-[15px]">
              {isEdit
                ? L('Επεξεργαστείτε τα στοιχεία ή απενεργοποιήστε τον λογαριασμό.', 'Edit details or deactivate the account.')
                : L('Προσθέστε ένα άτομο ή κάντε μαζική εισαγωγή από CSV.', 'Add one person or bulk-import from CSV.')}
            </p>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              {office && <span className="text-[12.5px] text-ink-soft">{office}</span>}
              <Pill tone={status === 'active' ? 'success' : 'neutral'}>{status === 'active' ? L('Ενεργός', 'Active') : L('Ανενεργός', 'Inactive')}</Pill>
            </div>
          )}
        </div>

        {!isEdit && (
          <div className="flex items-center gap-0.5 bg-bg border border-line rounded p-0.5 mb-6 w-fit">
            <button onClick={() => setMode('one')} className={`px-4 py-1.5 rounded-xs text-[13px] font-medium transition ${mode === 'one' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>{L('Ένα άτομο', 'One person')}</button>
            <button onClick={() => setMode('csv')} className={`px-4 py-1.5 rounded-xs text-[13px] font-medium transition ${mode === 'csv' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft hover:text-ink'}`}>{L('Εισαγωγή CSV', 'Import CSV')}</button>
          </div>
        )}
      </section>

      {isEdit && loading && <div className="p-8 max-w-[860px] text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      <section className="p-8 pt-0 max-w-[860px] pb-40 space-y-4">
        {mode === 'one' ? (
          <>
            <FormSection title={L('Στοιχεία ατόμου', 'Person')} sub={L('Όνομα υποχρεωτικό. Τα υπόλοιπα μπορούν να μπουν αργότερα.', 'Name is required. Everything else can be added later.')}>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label={L('Όνομα', 'First name')}>
                  <input className={txtInputCls} value={firstName} onChange={(e) => { setFirstName(e.target.value); touch() }} placeholder="Μαρία" />
                </Field>
                <Field label={L('Επώνυμο', 'Last name')}>
                  <input className={txtInputCls} value={lastName} onChange={(e) => { setLastName(e.target.value); touch() }} placeholder="Παπαδοπούλου" />
                </Field>
                <Field label={L('Email εργασίας', 'Work email')} hint={L('Προαιρετικό — εδώ θα πάει η πρόσκληση αν την στείλετε.', 'Optional — the invite would land here.')}>
                  <input className={txtInputCls} type="email" value={email} onChange={(e) => { setEmail(e.target.value); touch() }} placeholder="name@acme.gr" />
                </Field>
                <Field label={L('Κωδικός εργαζομένου (HR)', 'Employee ID (HR)')} hint={L('Βοηθά στο matching με payroll.', 'Helps match against payroll.')}>
                  <input className={txtInputCls} value={empId} onChange={(e) => { setEmpId(e.target.value); touch() }} placeholder="HR-0042" />
                </Field>
              </div>
            </FormSection>

            <FormSection title={L('Κωδικός voucher GonnaOrder', 'GonnaOrder voucher code')} sub={L('Συνδέει τις παραγγελίες του υπαλλήλου με τις παροχές του.', 'Links the employee’s orders to their benefits.')}>
              <Field label={L('Voucher code', 'Voucher code')} hint={L('Αν αφεθεί κενό, χρησιμοποιείται ο HR κωδικός.', 'If blank, the HR ID will be used.')}>
                <input className={txtInputCls + ' font-mono'} value={voucher} onChange={(e) => { setVoucher(e.target.value); touch() }} placeholder="employee_name" />
              </Field>
            </FormSection>

            {isEdit && (
              <>
                <FormSection title={L('Κατάσταση', 'Status')} sub={L('Ενεργός = παραγγελίες μετράνε προς την παροχή. Ανενεργός = αναστολή.', 'Active = orders count toward the benefit. Inactive = paused.')}>
                  <div className="flex items-center gap-3">
                    <Btn variant={status === 'active' ? 'primary' : 'secondary'} size="md" onClick={() => { setStatus('active'); touch() }}>{L('Ενεργός', 'Active')}</Btn>
                    <Btn variant={status === 'inactive' ? 'danger' : 'secondary'} size="md" onClick={() => { setStatus('inactive'); touch() }}>{L('Απενεργοποίηση', 'Deactivate')}</Btn>
                  </div>
                </FormSection>

                <FormSection title={L('Παροχές', 'Benefits')} sub={L('Ενεργές αναθέσεις. Πατήστε × για να ακυρώσετε.', 'Active assignments. Click × to unassign.')}>
                  {assignments.length === 0 ? (
                    <div className="text-[13px] text-ink-faint">{L('Κανένα ενεργό benefit', 'No active benefits')}</div>
                  ) : (
                    <div className="space-y-2">
                      {assignments.map((a) => {
                        const b = a.benefits
                        if (!b) return null
                        const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
                        const cadLabel = rule?.topup_cadence === 'monthly' ? L('κάθε μήνα', 'every month')
                          : rule?.topup_cadence === 'weekly' ? L('κάθε εβδομάδα', 'every week')
                          : rule?.topup_cadence === 'daily' ? L('καθημερινά', 'every day')
                          : rule?.topup_cadence === 'one_time' ? L('μία φορά', 'one-off') : ''
                        return (
                          <div key={a.id} className="flex items-center gap-3 p-3 border border-line rounded">
                            <div className="w-9 h-9 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon name="wallet" /></div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[14px] truncate">{lang === 'el' ? b.name_el : b.name_en}</div>
                              <div className="text-[12px] text-ink-soft num">{moneyFull(b.credit_amount, lang)} · {cadLabel}</div>
                            </div>
                            {a.gonnaorder_voucher_code && (
                              <span className="text-[10.5px] font-mono bg-bg border border-line text-ink-faint px-1.5 py-0.5 rounded-xs shrink-0">{a.gonnaorder_voucher_code}</span>
                            )}
                            <button onClick={() => void unassign(a.id)} disabled={unassigning === a.id}
                              className="w-7 h-7 rounded-xs flex items-center justify-center text-ink-faint hover:text-danger hover:bg-danger/5 disabled:opacity-50"
                              title={L('Ακύρωση', 'Unassign')}>
                              <Icon name="x" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </FormSection>

                <FormSection title={L('Πρόσφατες παραγγελίες', 'Recent orders')} sub={L('Οι τελευταίες 30 παραγγελίες του υπαλλήλου.', 'The employee’s last 30 orders.')}>
                  {orders.length === 0 ? (
                    <div className="text-[13px] text-ink-faint">{L('Καμία παραγγελία ακόμη', 'No orders yet')}</div>
                  ) : (
                    <div className="border border-line rounded overflow-hidden">
                      <table className="w-full text-[13px]">
                        <thead className="bg-bg/40 border-b border-line">
                          <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                            <th className="px-3 py-2">{L('Ημ/νία', 'Date')}</th>
                            <th className="px-3 py-2">{L('Συνεργάτης', 'Vendor')}</th>
                            <th className="px-3 py-2 text-right">{L('Σύνολο', 'Total')}</th>
                            <th className="px-3 py-2 text-right">{L('Παροχή', 'Benefit')}</th>
                            <th className="px-3 py-2 text-right">{L('Επιπλέον', 'Extra')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {orders.map((o) => (
                            <tr key={o.id}>
                              <td className="px-3 py-2 font-mono text-[12px]">{o.delivery_date}</td>
                              <td className="px-3 py-2 truncate">{o.vendors?.name ?? '—'}</td>
                              <td className="px-3 py-2 text-right num">{moneyFull(o.subtotal, lang)}</td>
                              <td className="px-3 py-2 text-right num text-brand">{moneyFull(o.benefit_applied, lang)}</td>
                              <td className="px-3 py-2 text-right num text-ink-soft">{o.topup_amount > 0 ? moneyFull(o.topup_amount, lang) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormSection>
              </>
            )}

            {err && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{err}</div>}
          </>
        ) : (
          <>
            <FormSection title={L('Δείγμα CSV', 'Sample CSV')} sub={L('Κατεβάστε το πρότυπο για να δείτε τις σωστές στήλες.', 'Download the template to see the exact columns.')}>
              <div className="flex items-center gap-3 flex-wrap">
                <Btn variant="primary" size="md" onClick={downloadSampleCsv}><Icon name="file" /><span>{L('Κατέβασμα δείγματος CSV', 'Download sample CSV')}</span></Btn>
                <span className="text-[12.5px] text-ink-soft font-mono">orexi-employees-sample.csv · UTF-8</span>
              </div>
            </FormSection>

            <FormSection title={L('Μορφή αρχείου', 'File format')} sub={L('Πρώτη γραμμή = headers (προαιρετικά). Στήλες:', 'First row = headers (optional). Columns:')}>
              <div className="bg-bg/50 border border-line rounded p-4 text-[12.5px] font-mono leading-[18px] text-ink-soft overflow-x-auto">
                <div><span className="text-ink font-semibold">display_name</span>,<span className="text-ink font-semibold">email</span>,employee_id</div>
                <div className="mt-1.5">Μαρία Παπαδοπούλου,maria.p@acme.gr,HR-0001</div>
                <div>Γιώργος Αθανασίου,giorgos.a@acme.gr,HR-0002</div>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-soft">{L('Υποχρεωτικό:', 'Required:')} <span className="font-mono text-ink">display_name</span>. {L('Προαιρετικά:', 'Optional:')} <span className="font-mono text-ink">email</span>, <span className="font-mono text-ink">employee_id</span> (γίνεται voucher).</p>
            </FormSection>

            <FormSection title={L('Επικόλληση CSV', 'Paste CSV')} sub={L('Επικολλήστε τις γραμμές απευθείας εδώ.', 'Paste the rows directly here.')}>
              <textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)}
                placeholder={'display_name,email,employee_id\nΜαρία Παπαδοπούλου,maria@acme.gr,HR-001\nΓιώργος Αντωνίου,,HR-002'}
                className="w-full px-3 py-2 bg-surface border border-line rounded-xs text-[13px] font-mono placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
              {bulkMsg && <div className="mt-3 text-sm text-ink-soft">{bulkMsg}</div>}
            </FormSection>
          </>
        )}
      </section>

      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line">
        <div className="max-w-[860px] px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="text-[12.5px] text-ink-soft">
            {mode === 'csv'
              ? L('Άμεση εισαγωγή στην εταιρεία (διπλά παραλείπονται).', 'Direct import into the company (duplicates skipped).')
              : (dirty ? L('Μη αποθηκευμένες αλλαγές', 'You have unsaved changes') : L('Συμπληρώστε τα στοιχεία και αποθηκεύστε.', 'Fill in the fields and save.'))}
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="md" onClick={() => navigate('/company/employees')}>{L('Ακύρωση', 'Cancel')}</Btn>
            {mode === 'csv' ? (
              <Btn variant="primary" size="md" disabled={bulkBusy} onClick={importCsv}>
                <Icon name="check" /><span>{bulkBusy ? L('Εισαγωγή…', 'Importing…') : L('Εισαγωγή', 'Import')}</span>
              </Btn>
            ) : (
              <Btn variant="primary" size="md" disabled={saving} onClick={saveOne}>
                <Icon name="check" /><span>{saving ? L('Αποθήκευση…', 'Saving…') : (isEdit ? L('Αποθήκευση', 'Save changes') : L('Δημιουργία υπαλλήλου', 'Create employee'))}</span>
              </Btn>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
