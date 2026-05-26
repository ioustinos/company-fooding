import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import {
  Icon, Btn, FormSection, Field, RadioCard, txtInputCls, selectCls, moneyFull,
} from '../../lib/specui'

// ── types ────────────────────────────────────────────────────────────────
type Cadence = 'monthly' | 'weekly' | 'daily' | 'one_time'
type Carryover = 'reset' | 'accumulate'
type AssignMode = 'all' | 'group' | 'pick'
type Employee = { id: string; display_name: string; email: string | null; external_ref: string | null; status: string; group_id: string | null }
type Group = { id: string; code: string; name_el: string; name_en: string; status: 'active' | 'archived'; is_system: boolean; people?: number }
type Rule = {
  topup_cadence: Cadence; carryover: Carryover
  daily_cap: number | null; per_order_min: number | null; per_order_max: number | null
  days_of_week: number[] | null
  topup_dom: number | null; topup_dom_eom: boolean | null
  topup_dow: number | null; topup_time: string | null
}
type Benefit = {
  id: string; name_el: string; name_en: string
  description_el: string | null; description_en: string | null
  credit_amount: number; valid_from: string; valid_to: string | null
  benefit_rules: Rule[] | Rule | null
}

const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DOW_LABELS: Record<string, { el: string; en: string }> = {
  mon: { el: 'Δε', en: 'Mo' }, tue: { el: 'Τρ', en: 'Tu' }, wed: { el: 'Τε', en: 'We' },
  thu: { el: 'Πε', en: 'Th' }, fri: { el: 'Πα', en: 'Fr' }, sat: { el: 'Σα', en: 'Sa' }, sun: { el: 'Κυ', en: 'Su' },
}
const centsToEur = (c: number | null | undefined) => (c == null ? '' : (c / 100).toString())

export default function BenefitEditPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  // ── form state ──
  const [nameEl, setNameEl] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('6.00')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [carryover, setCarryover] = useState<Carryover>('reset')
  // anchor (captured; persisted once migration 16 lands)
  const [dom, setDom] = useState(1)
  const [domEom, setDomEom] = useState(false)
  const [dow, setDow] = useState(1) // 1=Mon
  const [time, setTime] = useState('07:00')
  const [oneTimeDate, setOneTimeDate] = useState(new Date().toISOString().slice(0, 10))
  // rules
  const [dailyCap, setDailyCap] = useState('')
  const [perOrderMin, setPerOrderMin] = useState('')
  const [perOrderMax, setPerOrderMax] = useState('')
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  // assignment
  const [assignMode, setAssignMode] = useState<AssignMode>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  // validity
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [validTo, setValidTo] = useState('')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const touch = () => setDirty(true)

  // ── load roster + (if edit) the benefit ──
  useEffect(() => {
    if (!token || !selectedId) return
    ;(async () => {
      try {
        const [empRes, grpRes] = await Promise.all([
          fetch(`/api/cf-employees?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } }),
          fetch(`/api/cf-groups?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } }),
        ])
        if (empRes.ok) { const d = await empRes.json(); setEmployees((d.employees ?? []).filter((e: Employee) => e.status === 'active')) }
        if (grpRes.ok) { const d = await grpRes.json(); setGroups((d.groups ?? []).filter((g: Group) => g.status === 'active' && !g.is_system)) }
      } catch { /* ignore */ }
    })()
  }, [token, selectedId])

  useEffect(() => {
    if (!token || !isEdit) return
    setLoading(true)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-benefits?id=${id}`, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        const d = await r.json()
        const b: Benefit = d.benefit
        const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
        setNameEl(b.name_el); setNameEn(b.name_en)
        setDesc(b.description_el || b.description_en || '')
        setAmount((b.credit_amount / 100).toFixed(2))
        if (rule) {
          setCadence(rule.topup_cadence); setCarryover(rule.carryover)
          setDailyCap(centsToEur(rule.daily_cap)); setPerOrderMin(centsToEur(rule.per_order_min)); setPerOrderMax(centsToEur(rule.per_order_max))
          if (rule.days_of_week && rule.days_of_week.length) setDays(new Set(rule.days_of_week))
          if (rule.topup_dom != null) setDom(rule.topup_dom)
          if (rule.topup_dom_eom) setDomEom(true)
          if (rule.topup_dow != null) setDow(rule.topup_dow)
          if (rule.topup_time) setTime(rule.topup_time.slice(0, 5))
        }
        setValidFrom(b.valid_from); setValidTo(b.valid_to || '')
        const assigned: string[] = d.assignedEmployeeIds ?? []
        if (assigned.length > 0) { setAssignMode('pick'); setPicked(new Set(assigned)) }
      } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [token, id, isEdit])

  // ── derived ──
  const amountCents = Math.round((Number(amount) || 0) * 100)
  const groupMemberIds = (() => {
    if (assignMode !== 'group' || pickedGroups.size === 0) return new Set<string>()
    const ids = new Set<string>()
    for (const e of employees) if (e.group_id && pickedGroups.has(e.group_id)) ids.add(e.id)
    return ids
  })()
  const peopleCount = assignMode === 'all'
    ? employees.length
    : assignMode === 'pick'
      ? picked.size
      : groupMemberIds.size
  const cycleCost = peopleCount * amountCents

  const cadenceLabel: Record<Cadence, string> = {
    monthly: L('κάθε μήνα', 'every month'), weekly: L('κάθε εβδομάδα', 'every week'),
    daily: L('καθημερινά', 'every day'), one_time: L('μία φορά', 'one-off'),
  }

  const preview = useMemo(() => {
    const dl = (k: typeof DOW[number]) => DOW_LABELS[k][lang]
    if (cadence === 'monthly') {
      return domEom
        ? `${L('Τελευταία ημέρα κάθε μήνα στις', 'Last day of each month at')} ${time}`
        : `${L(`Ημέρα ${dom} κάθε μήνα στις`, `Day ${dom} of each month at`)} ${time}`
    }
    if (cadence === 'weekly') return `${L('Κάθε', 'Every')} ${dl(DOW[dow - 1])} ${L('στις', 'at')} ${time}`
    if (cadence === 'daily') return `${L('Κάθε μέρα στις', 'Every day at')} ${time}`
    return `${L('Στις', 'At')} ${oneTimeDate} ${time}`
  }, [cadence, dom, domEom, dow, time, oneTimeDate, lang])

  const toggleDay = (d: number) => { setDays((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n }); touch() }
  const togglePick = (eid: string) => { setPicked((s) => { const n = new Set(s); n.has(eid) ? n.delete(eid) : n.add(eid); return n }); touch() }

  const filtered = employees.filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (e.display_name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.external_ref || '').toLowerCase().includes(q)
  })

  // ── save ──
  async function save() {
    if (!token || !selectedId) return
    if (!nameEl.trim() || !nameEn.trim()) { setErr(L('Συμπληρώστε όνομα EL και EN', 'Fill in both Greek and English names')); return }
    if (!(Number(amount) >= 0)) { setErr(L('Μη έγκυρο ποσό', 'Invalid amount')); return }
    setSaving(true); setErr(null)
    const payload = {
      companyId: selectedId,
      name_el: nameEl, name_en: nameEn,
      description_el: desc, description_en: desc,
      credit_amount_eur: Number(amount),
      topup_cadence: cadence, carryover,
      daily_cap_eur: dailyCap === '' ? null : Number(dailyCap),
      per_order_min_eur: perOrderMin === '' ? null : Number(perOrderMin),
      per_order_max_eur: perOrderMax === '' ? null : Number(perOrderMax),
      days_of_week: [...days].sort((a, b) => a - b),
      valid_from: validFrom || undefined,
      valid_to: validTo || null,
      // anchor (cf-benefits picks the relevant fields based on cadence)
      topup_dom: dom,
      topup_dom_eom: domEom,
      topup_dow: dow,
      topup_time: time,
    }
    try {
      const r = await fetch('/api/cf-benefits', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(isEdit ? { ...payload, id } : payload),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      const benefitId = isEdit ? id : d.benefit?.id
      // assignment
      if (benefitId) {
        if (assignMode === 'all') {
          await fetch('/api/cf-benefit-assign', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ benefitId, target: 'all' }) })
        } else if (assignMode === 'pick' && picked.size > 0) {
          await fetch('/api/cf-benefit-assign', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ benefitId, target: 'employees', employeeIds: [...picked] }) })
        } else if (assignMode === 'group' && groupMemberIds.size > 0) {
          await fetch('/api/cf-benefit-assign', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ benefitId, target: 'employees', employeeIds: [...groupMemberIds] }) })
        }
      }
      navigate('/company/benefits')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  const initials = (name: string) => name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <section className="p-8 pb-0 max-w-[1100px]">
        <button onClick={() => navigate('/company/benefits')} className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink mb-5">
          <span className="rotate-180"><Icon name="chevron_r" /></span>{L('Πίσω στη λίστα', 'Back to list')}
        </button>
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <h1 className="font-display text-[36px] leading-[44px] font-semibold">
              {isEdit ? L('Επεξεργασία παροχής', 'Edit benefit') : L('Νέα παροχή', 'New benefit')}
            </h1>
            <p className="text-ink-soft mt-2 text-[15px]">
              {isEdit
                ? L('Οι αλλαγές εφαρμόζονται στον επόμενο κύκλο.', 'Changes apply at the next cycle.')
                : L('Ρυθμίστε τι λαμβάνουν οι εργαζόμενοι και πού.', 'Configure what employees receive and where.')}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="p-8 text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
      ) : (
        <section className="p-8 pt-0 pb-40 max-w-[1100px] space-y-4">

          {/* Basics */}
          <FormSection title={L('Βασικά στοιχεία', 'Basics')} sub={L('Όνομα και περιγραφή.', 'Name and description.')}>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label={L('Όνομα στα Ελληνικά', 'Greek name')}>
                <input className={txtInputCls} value={nameEl} onChange={(e) => { setNameEl(e.target.value); touch() }} placeholder="Μηνιαίο γεύμα" />
              </Field>
              <Field label={L('Όνομα στα Αγγλικά', 'English name')}>
                <input className={txtInputCls} value={nameEn} onChange={(e) => { setNameEn(e.target.value); touch() }} placeholder="Monthly meal" />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={L('Περιγραφή (προαιρετικό)', 'Description (optional)')}>
                <textarea rows={2} value={desc} onChange={(e) => { setDesc(e.target.value); touch() }}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition"
                  placeholder={L('π.χ. €6/ημέρα για μεσημεριανό', 'e.g. €6/day for lunch')} />
              </Field>
            </div>
          </FormSection>

          {/* Amount & cadence */}
          <FormSection title={L('Ποσό & συχνότητα', 'Amount & cadence')} sub={L('Πόσα χρήματα, πόσο συχνά.', 'How much, how often.')}>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label={L('Ποσό πίστωσης', 'Credit amount')} hint={L('Ποσό που λαμβάνει ο εργαζόμενος ανά κύκλο.', 'Amount each employee receives per cycle.')}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft font-semibold">€</span>
                  <input type="number" step="0.01" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); touch() }}
                    className="w-full h-10 pl-7 pr-3 bg-surface border border-line rounded-xs text-[14px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
                </div>
              </Field>
              <Field label={L('Συχνότητα ανανέωσης', 'Top-up cadence')}>
                <select className={selectCls} value={cadence} onChange={(e) => { setCadence(e.target.value as Cadence); touch() }}>
                  <option value="monthly">{L('Μηνιαία', 'Monthly')}</option>
                  <option value="weekly">{L('Εβδομαδιαία', 'Weekly')}</option>
                  <option value="daily">{L('Ημερήσια', 'Daily')}</option>
                  <option value="one_time">{L('Εφάπαξ', 'One-off')}</option>
                </select>
              </Field>
            </div>

            {/* Anchor */}
            <div className="mt-5 bg-bg/50 border border-line rounded p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[12.5px] font-semibold text-ink">{L('Πότε ακριβώς γίνεται η ανανέωση;', 'When exactly does it top up?')}</span>
                <span className="text-[11px] text-ink-faint">{L('ωρολογιακή ζώνη Αθήνας', 'Athens timezone')}</span>
              </div>

              {cadence === 'monthly' && (
                <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
                  <Field label={L('Ημέρα του μήνα', 'Day of month')} hint={L('1-31 · ή «τελευταία ημέρα»', '1-31 · or "last day"')}>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} max={31} value={dom} disabled={domEom}
                        onChange={(e) => { setDom(Math.max(1, Math.min(31, parseInt(e.target.value) || 1))); touch() }}
                        className={`w-20 h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 ${domEom ? 'opacity-40' : ''}`} />
                      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft cursor-pointer ml-1">
                        <input type="checkbox" checked={domEom} onChange={(e) => { setDomEom(e.target.checked); touch() }} className="w-4 h-4 accent-brand" />
                        {L('Τελευταία ημέρα', 'Last day')}
                      </label>
                    </div>
                  </Field>
                  <Field label={L('Ώρα', 'Time')}>
                    <input type="time" value={time} onChange={(e) => { setTime(e.target.value); touch() }} className="w-28 h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono" />
                  </Field>
                </div>
              )}

              {cadence === 'weekly' && (
                <div>
                  <span className="block text-[12.5px] font-semibold text-ink mb-2">{L('Ημέρα της εβδομάδας', 'Day of week')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const on = dow === d
                      return (
                        <button key={d} onClick={() => { setDow(d); touch() }}
                          className={`w-12 h-10 border rounded-xs text-[12.5px] font-semibold transition ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`}>
                          {DOW_LABELS[DOW[d - 1]][lang]}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 max-w-[200px]">
                    <Field label={L('Ώρα', 'Time')}>
                      <input type="time" value={time} onChange={(e) => { setTime(e.target.value); touch() }} className="w-28 h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono" />
                    </Field>
                  </div>
                </div>
              )}

              {cadence === 'daily' && (
                <div className="max-w-[260px]">
                  <Field label={L('Ώρα ανανέωσης', 'Top-up time')} hint={L('3-pass retry στις 05:00 / 08:00 / 12:00 αν αποτύχει', 'retry at 05:00 / 08:00 / 12:00 if it fails')}>
                    <input type="time" value={time} onChange={(e) => { setTime(e.target.value); touch() }} className="w-28 h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono" />
                  </Field>
                </div>
              )}

              {cadence === 'one_time' && (
                <div className="grid md:grid-cols-2 gap-3 max-w-md">
                  <Field label={L('Ημερομηνία', 'Date')}>
                    <input type="date" value={oneTimeDate} onChange={(e) => { setOneTimeDate(e.target.value); touch() }} className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono" />
                  </Field>
                  <Field label={L('Ώρα', 'Time')}>
                    <input type="time" value={time} onChange={(e) => { setTime(e.target.value); touch() }} className="w-28 h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono" />
                  </Field>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-line text-[12.5px] text-ink-soft">
                <span className="text-ink-faint uppercase tracking-[0.06em] font-semibold text-[10.5px]">{L('Προεπισκόπηση', 'Preview')}</span>
                <span className="ml-2 text-ink font-medium num">{preview}</span>
              </div>
            </div>

            {/* Carryover */}
            <div className="mt-5">
              <span className="block text-[12.5px] font-semibold text-ink mb-2">{L('Τι γίνεται με υπόλοιπο που δεν ξοδεύτηκε;', 'What happens to unspent balance?')}</span>
              <div className="grid md:grid-cols-2 gap-2">
                <RadioCard name="carry" checked={carryover === 'reset'} onClick={() => { setCarryover('reset'); touch() }}
                  title={L('Επαναφορά', 'Reset')} sub={L('Χάνεται στο τέλος του κύκλου.', 'Lost at the end of the cycle.')} />
                <RadioCard name="carry" checked={carryover === 'accumulate'} onClick={() => { setCarryover('accumulate'); touch() }}
                  title={L('Συσσώρευση', 'Accumulate')} sub={L('Μεταφέρεται στον επόμενο κύκλο.', 'Rolls over to next cycle.')} />
              </div>
            </div>
          </FormSection>

          {/* Rules */}
          <FormSection title={L('Κανόνες χρήσης', 'Usage rules')} sub={L('Όρια και περιορισμοί ανά παραγγελία.', 'Caps and per-order limits.')}>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label={L('Μέγιστο ανά ημέρα', 'Daily cap')} hint={L('Άθροισμα όλων των παραγγελιών μιας ημέρας. Κενό = χωρίς όριο.', 'Sum across all orders in a day. Empty = no cap.')}>
                <input className={txtInputCls} type="number" step="0.50" min="0" value={dailyCap} onChange={(e) => { setDailyCap(e.target.value); touch() }} placeholder="€6,00" />
              </Field>
              <Field label={L('Ελάχιστη παραγγελία', 'Per-order minimum')} hint={L('Η παροχή δεν εφαρμόζεται σε μικρότερες παραγγελίες.', "Benefit won't apply to smaller orders.")}>
                <input className={txtInputCls} type="number" step="0.50" min="0" value={perOrderMin} onChange={(e) => { setPerOrderMin(e.target.value); touch() }} placeholder="€3,00" />
              </Field>
              <Field label={L('Μέγιστη παραγγελία', 'Per-order maximum')} hint={L('Μέγιστη συνεισφορά σε μία παραγγελία. Κενό = χωρίς όριο.', 'Max contribution per single order. Empty = no cap.')}>
                <input className={txtInputCls} type="number" step="0.50" min="0" value={perOrderMax} onChange={(e) => { setPerOrderMax(e.target.value); touch() }} placeholder="€20,00" />
              </Field>
            </div>
            <div className="mt-5">
              <span className="block text-[12.5px] font-semibold text-ink mb-2">{L('Ημέρες που ισχύει', 'Days of week')}</span>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = days.has(d)
                  return (
                    <button key={d} onClick={() => toggleDay(d)}
                      className={`w-10 h-9 border rounded-xs text-[12.5px] font-semibold transition ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`}>
                      {DOW_LABELS[DOW[d - 1]][lang]}
                    </button>
                  )
                })}
              </div>
            </div>
          </FormSection>

          {/* Assignment */}
          <FormSection title={L('Ανάθεση', 'Assignment')} sub={L('Ποιοι λαμβάνουν την παροχή.', 'Who receives this benefit.')}>
            <div className="grid md:grid-cols-3 gap-2">
              <RadioCard name="assign" checked={assignMode === 'all'} onClick={() => { setAssignMode('all'); touch() }}
                title={L('Όλοι οι εργαζόμενοι', 'All employees')} sub={<><span className="num">{employees.length}</span> {L('άτομα', 'people')}</>} />
              <RadioCard name="assign" checked={assignMode === 'group'} onClick={() => { setAssignMode('group'); touch() }}
                title={L('Συγκεκριμένη ομάδα', 'Specific group')} sub={L('Ανά ομάδα/τμήμα', 'By team/department')} />
              <RadioCard name="assign" checked={assignMode === 'pick'} onClick={() => { setAssignMode('pick'); touch() }}
                title={L('Επιλεγμένα άτομα', 'Specific people')} sub={L('Διαλέξτε χειροκίνητα', 'Pick manually')} />
            </div>

            {assignMode === 'all' && (
              <div className="mt-4 bg-bg/50 border border-line rounded p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="users" /></div>
                <div className="font-display text-[22px] font-semibold">{L('Όλοι οι', 'All')} <span className="num">{employees.length}</span> {L('εργαζόμενοι', 'employees')}</div>
                <div className="text-[13px] text-ink-soft mt-1">{L('Η παροχή θα ανατεθεί σε όλους τους ενεργούς εργαζόμενους.', 'The benefit will be assigned to all active employees.')}</div>
              </div>
            )}

            {assignMode === 'group' && (
              <div className="mt-4 bg-bg/50 border border-line rounded p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[12.5px] font-semibold text-ink">{L('Επιλέξτε ομάδες', 'Pick groups')}</div>
                  <a href="/company/groups" className="text-[12px] text-brand font-medium hover:underline">{L('Διαχείριση ομάδων →', 'Manage groups →')}</a>
                </div>
                {groups.length === 0 ? (
                  <div className="text-[13px] text-ink-faint">{L('Δεν υπάρχουν ομάδες ακόμη. Δημιουργήστε ομάδα στη σελίδα Ομάδες, ή αναθέστε με "Επιλεγμένα άτομα".', 'No groups yet. Create one on the Groups page, or use "Specific people".')}</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => {
                      const on = pickedGroups.has(g.id)
                      return (
                        <label key={g.id} className="cursor-pointer">
                          <input type="checkbox" className="hidden" checked={on} onChange={() => { setPickedGroups((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n }); touch() }} />
                          <span className={`inline-flex items-center gap-2 px-3 h-9 border rounded-sm text-[12.5px] font-semibold transition ${on ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:text-ink'}`}>
                            <span className={`num text-[10.5px] ${on ? 'text-white/80' : 'text-ink-faint'}`}>{g.code}</span>
                            <span>{lang === 'el' ? g.name_el : g.name_en}</span>
                            <span className={`num text-[11px] ${on ? 'text-white/70' : 'text-ink-faint'}`}>·</span>
                            <span className={`num text-[11px] ${on ? 'text-white/70' : 'text-ink-faint'}`}>{g.people ?? 0}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {assignMode === 'pick' && (
              <div className="mt-4 border border-line rounded overflow-hidden">
                {picked.size > 0 && (
                  <div className="bg-brand-soft/30 border-b border-line p-3">
                    <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-2">{L('Επιλεγμένοι', 'Selected')} · <span className="num">{picked.size}</span> {L('από', 'of')} <span className="num">{employees.length}</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {employees.filter((e) => picked.has(e.id)).map((e) => (
                        <span key={e.id} className="inline-flex items-center gap-1.5 pl-2 pr-1 h-7 bg-brand text-white rounded-sm text-[12px] font-medium">
                          {e.display_name}
                          <button onClick={() => togglePick(e.id)} className="w-5 h-5 hover:bg-white/20 rounded-xs flex items-center justify-center">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 p-3 bg-bg/40 border-b border-line">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
                    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder={L('Αναζήτηση ονόματος, email ή κωδικού…', 'Search name, email, or code…')}
                      className="w-full h-9 pl-9 pr-3 bg-surface border border-line rounded-xs text-[13px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
                  </div>
                </div>
                <div className="max-h-[360px] overflow-y-auto divide-y divide-line bg-surface">
                  {filtered.length === 0 && <div className="p-6 text-center text-[13px] text-ink-faint">{L('Κανένας εργαζόμενος', 'No employees')}</div>}
                  {filtered.map((e) => {
                    const on = picked.has(e.id)
                    return (
                      <label key={e.id} onClick={(ev) => { ev.preventDefault(); togglePick(e.id) }}
                        className="flex items-center gap-3 p-3 hover:bg-brand-soft/20 cursor-pointer transition">
                        <input type="checkbox" checked={on} readOnly className="w-4 h-4 accent-brand pointer-events-none" />
                        <div className="w-8 h-8 rounded-full bg-brand-soft text-brand flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(e.display_name)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold truncate">{e.display_name}</div>
                          <div className="text-[11.5px] text-ink-soft truncate">{e.email || e.external_ref || '—'}</div>
                        </div>
                        {e.external_ref && <span className="text-[10.5px] font-mono bg-bg border border-line text-ink-faint px-1.5 py-0.5 rounded-xs shrink-0">{e.external_ref}</span>}
                      </label>
                    )
                  })}
                </div>
                <div className="p-3 bg-bg/40 border-t border-line flex items-center justify-between">
                  <div className="text-[12px] text-ink-soft">{L(`Εμφάνιση ${filtered.length} από ${employees.length}`, `Showing ${filtered.length} of ${employees.length}`)}</div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <button onClick={() => { setPicked(new Set(employees.map((e) => e.id))); touch() }} className="text-brand hover:underline font-medium">{L('Επιλογή όλων', 'Select all')}</button>
                    <span className="text-ink-faint">·</span>
                    <button onClick={() => { setPicked(new Set()); touch() }} className="text-ink-soft hover:text-ink">{L('Καθαρισμός', 'Clear')}</button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-line flex items-center gap-3 flex-wrap">
              <div className="flex-1 flex items-center gap-2 text-[12.5px]">
                <span className="text-ink-faint uppercase tracking-[0.06em] font-semibold text-[10.5px]">{L('Προεπισκόπηση', 'Preview')}</span>
                <span className="num text-[15px] font-semibold">{peopleCount}</span>
                <span className="text-ink-soft">{L('άτομα', 'people')}</span>
                <span className="text-ink-faint">·</span>
                <span className="text-ink-soft">{L('κόστος/κύκλο', 'cost/cycle')}</span>
                <span className="num text-[13.5px] font-semibold text-brand">{moneyFull(cycleCost, lang)}</span>
                <span className="text-ink-faint text-[11px]">({cadenceLabel[cadence]})</span>
              </div>
            </div>
          </FormSection>

          {/* Validity */}
          <FormSection title={L('Διάρκεια', 'Validity')} sub={L('Πότε ξεκινά και πότε τελειώνει.', 'When it starts and ends.')}>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label={L('Από', 'Starts')}>
                <input type="date" value={validFrom} onChange={(e) => { setValidFrom(e.target.value); touch() }} className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
              </Field>
              <Field label={L('Έως (προαιρετικό)', 'Ends (optional)')}>
                <input type="date" value={validTo} onChange={(e) => { setValidTo(e.target.value); touch() }} className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] font-mono focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
              </Field>
            </div>
          </FormSection>

          {err && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{err}</div>}
        </section>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-line">
        <div className="max-w-[1100px] px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[12.5px]">
            {dirty ? (
              <><span className="w-2 h-2 rounded-full bg-warn"></span><span className="text-[#A37620]">{L('Μη αποθηκευμένες αλλαγές', 'You have unsaved changes')}</span></>
            ) : (
              <span className="text-ink-faint">{L('Όλα αποθηκευμένα', 'All saved')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="secondary" size="md" onClick={() => navigate('/company/benefits')}>{L('Ακύρωση', 'Cancel')}</Btn>
            <Btn variant="primary" size="md" disabled={saving} onClick={save}>
              <Icon name="check" /><span>{saving ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση', 'Save benefit')}</span>
            </Btn>
          </div>
        </div>
      </div>
    </>
  )
}
