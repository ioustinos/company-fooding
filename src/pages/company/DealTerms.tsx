// Deal terms — the dated money terms of one deal (company × vendor).
// Purpose: "What are the money terms of this deal on a given date, and how do I
// add, change or end one without changing invoices already sent?"
// Super admins edit; everyone else with access reads.

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Btn, Field, Icon, Pill, selectCls, txtInputCls } from '../../lib/specui'
import { KIND_LABEL, ruleDates, ruleSentence, ruleState, type DealRuleView, type RuleKind } from '../../lib/dealRuleText'

type Mode = { type: 'create' } | { type: 'change'; rule: DealRuleView } | { type: 'correct'; rule: DealRuleView } | { type: 'end'; rule: DealRuleView }

// Form state is strings (what the inputs hold); converted on submit.
type Form = {
  kind: RuleKind; valid_from: string; valid_to: string; valueType: 'percent' | 'amount'
  percent: string; amount: string; scope_tags: string; min_order: string
  amount_unit: 'per_order' | 'per_benefit_day'; period: 'day' | 'week' | 'month'
  min_basis: 'fixed_amount' | 'orders_x_benefit'; min_orders: string
  counts_on: 'days_with_orders' | 'company_calendar' | 'company_calendar_plus_order_days'
  spend: string; earn: string; notes: string; end_date: string
}
const euros = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2))
const cents = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
function formFrom(r: DealRuleView | null, today: string): Form {
  return {
    kind: r?.kind ?? 'benefit_invoice_discount',
    valid_from: r?.valid_from ?? today, valid_to: r?.valid_to ?? '',
    valueType: r && r.percent == null && r.amount_cents != null && r.kind !== 'minimum_commitment' ? 'amount' : 'percent',
    percent: r?.percent != null ? String(r.percent) : '', amount: euros(r?.amount_cents ?? null),
    scope_tags: (r?.scope_tags ?? []).join(', '), min_order: euros(r?.min_order_cents ?? null),
    amount_unit: r?.amount_unit ?? 'per_order', period: r?.period ?? 'day',
    min_basis: r?.min_basis ?? 'fixed_amount', min_orders: r?.min_orders != null ? String(r.min_orders) : '',
    counts_on: r?.counts_on ?? 'days_with_orders',
    spend: euros(r?.spend_cents ?? null), earn: euros(r?.earn_cents ?? null), notes: r?.notes ?? '', end_date: today,
  }
}
function toRule(f: Form): Record<string, unknown> & DealRuleView {
  const isDiscount = f.kind === 'catalogue_discount' || f.kind === 'order_discount' || f.kind === 'benefit_invoice_discount'
  const pct = f.percent.trim() ? Number(f.percent.replace(',', '.')) : null
  return {
    kind: f.kind, valid_from: f.valid_from, valid_to: f.valid_to || null,
    percent: isDiscount && f.valueType === 'percent' ? pct : null,
    amount_cents: (isDiscount && f.valueType === 'amount') || (f.kind === 'minimum_commitment' && f.min_basis === 'fixed_amount') ? cents(f.amount) : null,
    scope_tags: f.kind === 'catalogue_discount' ? f.scope_tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    min_order_cents: f.kind === 'order_discount' ? cents(f.min_order) : null,
    amount_unit: f.kind === 'benefit_invoice_discount' && f.valueType === 'amount' ? f.amount_unit : null,
    period: f.kind === 'minimum_commitment' ? f.period : null,
    min_basis: f.kind === 'minimum_commitment' ? f.min_basis : null,
    min_orders: f.kind === 'minimum_commitment' && f.min_basis === 'orders_x_benefit' && f.min_orders ? Number(f.min_orders) : null,
    counts_on: f.kind === 'minimum_commitment' ? f.counts_on : null,
    spend_cents: f.kind === 'loyalty' ? cents(f.spend) : null,
    earn_cents: f.kind === 'loyalty' ? cents(f.earn) : null,
    notes: f.notes.trim() || null,
  }
}

export default function DealTerms({ agreementId }: { agreementId: string }) {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rules, setRules] = useState<DealRuleView[]>([])
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10))
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [form, setForm] = useState<Form>(formFrom(null, today))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load() {
    if (!token) return
    setLoading(true); setLoadError(null)
    try {
      const r = await fetch(`/api/cf-deal-rules?agreementId=${agreementId}`, { headers: { authorization: `Bearer ${token}` } })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setRules(d.rules ?? []); setToday(d.today); setCanEdit(!!d.canEdit)
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token, agreementId])

  const current = useMemo(() => rules.filter((r) => ruleState(r, today) !== 'ended')
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.valid_from.localeCompare(b.valid_from)), [rules, today])
  const history = useMemo(() => rules.filter((r) => ruleState(r, today) === 'ended')
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from)), [rules, today])

  function open(m: Mode) {
    setMode(m); setSaveError(null); setFieldErrors({}); setConfirmDelete(null)
    if (m.type === 'create') setForm(formFrom(null, today))
    else if (m.type === 'change') setForm({ ...formFrom(m.rule, today), valid_from: today > m.rule.valid_from ? today : m.rule.valid_from, valid_to: '' })
    else if (m.type === 'correct') setForm(formFrom(m.rule, today))
    else setForm({ ...formFrom(m.rule, today), end_date: today })
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function post(body: Record<string, unknown>) {
    setSaving(true); setSaveError(null); setFieldErrors({})
    try {
      const r = await fetch('/api/cf-deal-rules', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFieldErrors(d.validationErrors ?? {}); throw new Error(d.error || `HTTP ${r.status}`) }
      setMode(null); setConfirmDelete(null); await load()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  function submit() {
    if (!mode) return
    const rule = toRule(form)
    if (mode.type === 'create') return post({ action: 'create', agreementId, rule })
    if (mode.type === 'correct') return post({ action: 'correct', id: mode.rule.id, rule })
    if (mode.type === 'change') return post({ action: 'change', id: mode.rule.id, from: form.valid_from, rule: { ...rule, valid_from: form.valid_from } })
    return post({ action: 'end', id: mode.rule.id, end_date: form.end_date })
  }

  const preview = mode && mode.type !== 'end' ? toRule(form) : null
  const previewOk = preview && Object.values(preview).every((v) => !(typeof v === 'number' && Number.isNaN(v)))
  const fe = (k: string) => fieldErrors[k]?.join(' ')

  const stateTone = (r: DealRuleView) => ruleState(r, today) === 'active' ? 'success' : ruleState(r, today) === 'upcoming' ? 'warn' : 'neutral'
  const stateLabel = (r: DealRuleView) => ({ active: L('ενεργός', 'active'), upcoming: L('επερχόμενος', 'upcoming'), ended: L('έληξε', 'ended') })[ruleState(r, today)]

  const RuleRow = ({ r }: { r: DealRuleView }) => {
    const notStarted = r.valid_from > today
    return (
      <div className="px-4 py-3 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-faint font-semibold">{KIND_LABEL[r.kind][lang]}</div>
          <div className="text-[14px] text-ink mt-0.5">{ruleSentence(r, lang)}</div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
            <Pill tone={stateTone(r)}>{stateLabel(r)}</Pill><span>{ruleDates(r, today, lang)}</span>
          </div>
          {r.notes && <div className="text-[12px] text-ink-faint mt-1">{r.notes}</div>}
        </div>
        {canEdit && ruleState(r, today) !== 'ended' && (
          <div className="flex items-center gap-1.5 shrink-0">
            {notStarted ? (
              <>
                <Btn size="sm" variant="secondary" onClick={() => open({ type: 'correct', rule: r })}>{L('Διόρθωση', 'Edit')}</Btn>
                {confirmDelete === r.id
                  ? <Btn size="sm" variant="danger" disabled={saving} onClick={() => post({ action: 'delete', id: r.id })}>{L('Επιβεβαίωση διαγραφής', 'Confirm delete')}</Btn>
                  : <Btn size="sm" variant="ghost" onClick={() => setConfirmDelete(r.id ?? null)}>{L('Διαγραφή', 'Delete')}</Btn>}
              </>
            ) : (
              <>
                <Btn size="sm" variant="secondary" onClick={() => open({ type: 'change', rule: r })}>{L('Αλλαγή από ημερομηνία', 'Change from a date')}</Btn>
                <Btn size="sm" variant="ghost" onClick={() => open({ type: 'end', rule: r })}>{L('Λήξη', 'End')}</Btn>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const isDiscount = form.kind === 'catalogue_discount' || form.kind === 'order_discount' || form.kind === 'benefit_invoice_discount'

  return (
    <div className="bg-surface border border-line rounded-md shadow-sm">
      <div className="p-4 border-b border-line flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-[18px] font-semibold">{L('Όροι συμφωνίας', 'Deal terms')}</h2>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            {L('Χρησιμοποιούνται για τις αναφορές και την τιμολόγηση. Δεν αλλάζουν το site παραγγελιών.',
               'Used for reports and invoicing. They do not change the ordering site.')}
          </p>
        </div>
        {canEdit && !mode && <Btn size="sm" onClick={() => open({ type: 'create' })}><Icon name="plus" />{L('Νέος όρος', 'Add term')}</Btn>}
      </div>

      {mode && (
        <div className="p-4 border-b border-line bg-bg/40 space-y-4">
          <div className="text-[13px] font-semibold">
            {mode.type === 'create' && L('Νέος όρος', 'New term')}
            {mode.type === 'change' && L('Αλλαγή όρου από ημερομηνία — η τρέχουσα εκδοχή λήγει την προηγούμενη ημέρα', 'Change from a date — the current version ends the day before')}
            {mode.type === 'correct' && L('Διόρθωση όρου που δεν έχει ξεκινήσει', 'Edit a term that has not started yet')}
            {mode.type === 'end' && L('Λήξη όρου', 'End a term')}
          </div>

          {mode.type === 'end' ? (
            <div className="grid sm:grid-cols-2 gap-4 max-w-[560px]">
              <Field label={L('Τελευταία ημέρα ισχύος', 'Last day it applies')} hint={ruleSentence(mode.rule, lang)}>
                <input type="date" className={txtInputCls} value={form.end_date} min={mode.rule.valid_from} onChange={(e) => set('end_date', e.target.value)} />
              </Field>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label={L('Τύπος', 'Type')} hint={KIND_LABEL[form.kind][lang === 'el' ? 'hintEl' : 'hintEn']}>
                  <select className={selectCls} value={form.kind} disabled={mode.type !== 'create'} onChange={(e) => set('kind', e.target.value as RuleKind)}>
                    {(Object.keys(KIND_LABEL) as RuleKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k][lang]}</option>)}
                  </select>
                </Field>
                <Field label={mode.type === 'change' ? L('Νέα εκδοχή από', 'New version from') : L('Ισχύει από', 'Valid from')} hint={fe('valid_from')}>
                  <input type="date" className={txtInputCls} value={form.valid_from} onChange={(e) => set('valid_from', e.target.value)} />
                </Field>
                <Field label={L('Έως (προαιρετικό)', 'Until (optional)')} hint={fe('valid_to')}>
                  <input type="date" className={txtInputCls} value={form.valid_to} onChange={(e) => set('valid_to', e.target.value)} />
                </Field>
              </div>

              {isDiscount && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field label={L('Μορφή', 'Form')}>
                    <select className={selectCls} value={form.valueType} onChange={(e) => set('valueType', e.target.value as Form['valueType'])}>
                      <option value="percent">{L('Ποσοστό %', 'Percentage %')}</option>
                      <option value="amount">{L('Ποσό €', 'Amount €')}</option>
                    </select>
                  </Field>
                  {form.valueType === 'percent'
                    ? <Field label="%" hint={fe('percent') ?? fe('value')}><input className={txtInputCls} inputMode="decimal" value={form.percent} onChange={(e) => set('percent', e.target.value)} placeholder="10" /></Field>
                    : <Field label="€" hint={fe('amount_cents') ?? fe('value')}><input className={txtInputCls} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.50" /></Field>}
                  {form.kind === 'benefit_invoice_discount' && form.valueType === 'amount' && (
                    <Field label={L('Ανά', 'Per')} hint={fe('amount_unit')}>
                      <select className={selectCls} value={form.amount_unit} onChange={(e) => set('amount_unit', e.target.value as Form['amount_unit'])}>
                        <option value="per_order">{L('παραγγελία με παροχή', 'order using the benefit')}</option>
                        <option value="per_benefit_day">{L('υπάλληλο ανά ημέρα παροχής', 'employee per benefit day')}</option>
                      </select>
                    </Field>
                  )}
                  {form.kind === 'catalogue_discount' && (
                    <Field label={L('Ετικέτες (κενό = όλος ο κατάλογος)', 'Tags (empty = whole catalogue)')}>
                      <input className={txtInputCls} value={form.scope_tags} onChange={(e) => set('scope_tags', e.target.value)} placeholder="salads, soups" />
                    </Field>
                  )}
                  {form.kind === 'order_discount' && (
                    <Field label={L('Ελάχιστη παραγγελία € (προαιρετικό)', 'Minimum order € (optional)')} hint={fe('min_order_cents')}>
                      <input className={txtInputCls} inputMode="decimal" value={form.min_order} onChange={(e) => set('min_order', e.target.value)} />
                    </Field>
                  )}
                </div>
              )}

              {form.kind === 'minimum_commitment' && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Field label={L('Ανά', 'Per')} hint={fe('period')}>
                    <select className={selectCls} value={form.period} onChange={(e) => set('period', e.target.value as Form['period'])}>
                      <option value="day">{L('ημέρα', 'day')}</option><option value="week">{L('εβδομάδα', 'week')}</option><option value="month">{L('μήνα', 'month')}</option>
                    </select>
                  </Field>
                  <Field label={L('Ποσό ελάχιστης χρέωσης', 'Minimum is')} hint={fe('min_basis')}>
                    <select className={selectCls} value={form.min_basis} onChange={(e) => set('min_basis', e.target.value as Form['min_basis'])}>
                      <option value="fixed_amount">{L('σταθερό ποσό', 'a fixed amount')}</option>
                      <option value="orders_x_benefit">{L('παραγγελίες × ημερήσια παροχή', 'orders × daily benefit')}</option>
                    </select>
                  </Field>
                  {form.min_basis === 'fixed_amount'
                    ? <Field label="€" hint={fe('amount_cents')}><input className={txtInputCls} inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="50" /></Field>
                    : <Field label={L('Παραγγελίες', 'Orders')} hint={fe('min_orders')}><input className={txtInputCls} inputMode="numeric" value={form.min_orders} onChange={(e) => set('min_orders', e.target.value)} placeholder="20" /></Field>}
                  <Field label={L('Ποιες ημέρες μετράνε', 'Which days count')} hint={fe('counts_on')}>
                    <select className={selectCls} value={form.counts_on} onChange={(e) => set('counts_on', e.target.value as Form['counts_on'])}>
                      <option value="days_with_orders">{L('ημέρες με παραγγελίες', 'days with orders')}</option>
                      <option value="company_calendar">{L('εργάσιμες ημερολογίου', 'calendar workdays')}</option>
                      <option value="company_calendar_plus_order_days">{L('εργάσιμες + ημέρες με παραγγελίες', 'workdays + days with orders')}</option>
                    </select>
                  </Field>
                </div>
              )}

              {form.kind === 'loyalty' && (
                <div className="grid sm:grid-cols-2 gap-4 max-w-[560px]">
                  <Field label={L('Για κάθε € δαπάνης', 'For every € spent')} hint={fe('spend_cents')}>
                    <input className={txtInputCls} inputMode="decimal" value={form.spend} onChange={(e) => set('spend', e.target.value)} placeholder="20" />
                  </Field>
                  <Field label={L('Κερδίζει €', 'Earns €')} hint={fe('earn_cents')}>
                    <input className={txtInputCls} inputMode="decimal" value={form.earn} onChange={(e) => set('earn', e.target.value)} placeholder="1" />
                  </Field>
                </div>
              )}

              <Field label={L('Σημειώσεις (προαιρετικό)', 'Notes (optional)')}>
                <input className={txtInputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>

              {form.kind === 'minimum_commitment' && form.counts_on !== 'days_with_orders' && (
                <div className="text-[12px] text-[#A37620]">
                  {L('Χρειάζεται ημερολόγιο εταιρείας. Μέχρι να εισαχθεί, καμία ημέρα δεν θεωρείται εργάσιμη από το ημερολόγιο.',
                     'Needs a company calendar. Until one is imported, no day counts as a calendar workday.')}
                </div>
              )}

              {previewOk && preview && (
                <div className="rounded border border-line bg-surface px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-faint font-semibold">{L('Προεπισκόπηση', 'Preview')}</div>
                  <div className="text-[14px] mt-0.5">{ruleSentence(preview, lang)}</div>
                  <div className="text-[12px] text-ink-soft mt-0.5">{ruleDates(preview, today, lang)}</div>
                </div>
              )}
            </>
          )}

          {saveError && <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{saveError}</div>}
          <div className="flex items-center gap-2">
            <Btn size="sm" disabled={saving} onClick={() => void submit()}>{saving ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση', 'Save')}</Btn>
            <Btn size="sm" variant="ghost" disabled={saving} onClick={() => setMode(null)}>{L('Ακύρωση', 'Cancel')}</Btn>
          </div>
        </div>
      )}

      {loading ? <div className="p-4 text-[13px] text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
        : loadError ? <div className="p-4 text-[13px] text-danger">{loadError}</div>
        : (
          <>
            <div className="divide-y divide-line">
              {current.length === 0
                ? <div className="p-4 text-[13px] text-ink-faint">{L('Δεν υπάρχουν όροι — η παροχή τιμολογείται όπως καταναλώθηκε.', 'No terms — the benefit is billed as consumed.')}</div>
                : current.map((r) => <RuleRow key={r.id} r={r} />)}
            </div>
            {history.length > 0 && (
              <div className="border-t border-line">
                <button type="button" onClick={() => setShowHistory((v) => !v)} className="w-full px-4 py-2.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft hover:text-ink">
                  <span className={showHistory ? '' : '-rotate-90'}><Icon name="chevron_d" /></span>
                  {L(`Ιστορικό (${history.length})`, `History (${history.length})`)}
                </button>
                {showHistory && <div className="divide-y divide-line">{history.map((r) => <RuleRow key={r.id} r={r} />)}</div>}
              </div>
            )}
          </>
        )}
    </div>
  )
}
