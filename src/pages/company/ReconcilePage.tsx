// ReconcilePage (CF-96 rewrite)
//
// PAGE PURPOSE:
//   "For the selected company in this date range — what do I bill, and is
//    there anything I'm missing or that looks wrong before I send the invoice?"
//
// THREE HEADLINE BUCKETS:
//   ✅ TO BILL              — clean matched redemptions → goes on the invoice
//   ⚠️ NEEDS ATTENTION       — missing-in-CF (real ingestion gap) /
//                              amount mismatch / missing-in-GO
//   ℹ️ FOR INFO ONLY        — full-price (no voucher), orphan-voucher codes
//                              (need retro-benefit), cross-company at this store
//
// Per memory rule `reconcile-show-orphans`: orphan + no-voucher rows are
// always shown — they're signal, not noise.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, moneyFull } from '../../lib/specui'

type RowOut = {
  id: string
  voucher_code: string | null
  employee_name: string | null
  date: string | null
  subtotal_cents: number
  benefit_cents: number
  subtotal_delta?: number
  benefit_delta?: number
  cf_status?: string
}

type OrphanCodeAgg = {
  code: string
  count: number
  subtotal_cents: number
  benefit_cents: number
  first_seen: string | null
  last_seen: string | null
}

type Data = {
  period: { from: string; to: string }
  storeIds: string[]
  discount?: { pct: number; applies_to: string | null }
  headline: {
    toBill: {
      count: number
      subtotal_cents: number
      benefit_cents: number          // legacy alias = gross
      benefit_gross_cents: number
      discount_cents: number
      benefit_net_cents: number
    }
    needsAttention: {
      count: number
      missingKnownVoucher_count: number
      missingKnownVoucher_subtotal_cents: number
      missingKnownVoucher_benefit_cents: number
      mismatch_count: number
      mismatch_subtotal_delta_cents: number
      mismatch_benefit_delta_cents: number
      missingInGo_count: number
      missingInGo_subtotal_cents: number
      missingInGo_benefit_cents: number
    }
    forInfo: {
      count: number
      noVoucher_count: number
      noVoucher_subtotal_cents: number
      orphan_count: number
      orphan_subtotal_cents: number
      orphan_benefit_cents: number
      crossCompany_count: number
      crossCompany_subtotal_cents: number
      crossCompany_benefit_cents: number
    }
  }
  buckets: {
    matched: RowOut[]
    missingKnownVoucher: RowOut[]
    missingAmountMismatch: RowOut[]
    noVoucher: RowOut[]
    orphanVoucher: RowOut[]
    crossCompany: RowOut[]
    missingInGo: RowOut[]
  }
  orphanCodeSummary: OrphanCodeAgg[]
}

// Headline card. Big number + subline. Click to expand body.
function HeadlineCard(props: {
  tone: 'success' | 'warn' | 'info'
  icon: 'check' | 'bell' | 'history'
  title: string
  count: number
  subline: string
  expanded: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  const toneRing =
    props.tone === 'success' ? 'border-success/40 bg-success/5' :
    props.tone === 'warn'    ? 'border-warn/40 bg-warn/5' :
                               'border-line bg-surface'
  const toneText =
    props.tone === 'success' ? 'text-success' :
    props.tone === 'warn'    ? 'text-warn' :
                               'text-ink-soft'
  return (
    <div className={`rounded-md border ${toneRing} shadow-sm`}>
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-bg/30 transition-colors"
      >
        <div className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border ${props.tone === 'success' ? 'border-success/40 text-success' : props.tone === 'warn' ? 'border-warn/40 text-warn' : 'border-line text-ink-soft'}`}>
          <Icon name={props.icon} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[20px] font-semibold">{props.title}</span>
            <span className={`font-mono text-[28px] leading-none font-semibold ${toneText} num`}>{props.count}</span>
          </div>
          <p className="text-[12.5px] text-ink-soft mt-1">{props.subline}</p>
        </div>
        <Icon name="chevron_d" size={18} className={props.expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {props.expanded && props.children && (
        <div className="border-t border-line px-5 py-4 space-y-4">
          {props.children}
        </div>
      )}
    </div>
  )
}

// Sub-bucket table. Re-used for every sub-section under a headline card.
function BucketTable(props: {
  title: string
  blurb?: string
  rows: RowOut[]
  totalCount: number
  showDeltas?: boolean
  showCfStatus?: boolean
  rowAction?: (r: RowOut) => React.ReactNode
  lang: 'el' | 'en'
}) {
  const { rows, totalCount, lang } = props
  if (totalCount === 0) return null
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display text-[15px] font-semibold">
          {props.title} <span className="text-ink-faint font-mono text-[13px] ml-1">({totalCount})</span>
        </h3>
        {rows.length < totalCount && (
          <span className="text-[11.5px] text-ink-faint">
            {lang === 'el' ? `Δείχνω ${rows.length} από ${totalCount}` : `Showing ${rows.length} of ${totalCount}`}
          </span>
        )}
      </div>
      {props.blurb && <p className="text-[12.5px] text-ink-soft mb-2">{props.blurb}</p>}
      <div className="bg-white border border-line rounded-xs overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-bg/40 border-b border-line">
            <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
              <th className="px-3 py-2">{lang === 'el' ? 'Ημ/νία' : 'Date'}</th>
              <th className="px-3 py-2">{lang === 'el' ? 'Κωδ.' : 'Code'}</th>
              <th className="px-3 py-2">{lang === 'el' ? 'Υπάλληλος' : 'Employee'}</th>
              <th className="px-3 py-2 text-right">{lang === 'el' ? 'Σύνολο' : 'Total'}</th>
              <th className="px-3 py-2 text-right">{lang === 'el' ? 'Παροχή' : 'Benefit'}</th>
              {props.showDeltas && <th className="px-3 py-2 text-right">{lang === 'el' ? 'Δ Σύν.' : 'Δ Total'}</th>}
              {props.showDeltas && <th className="px-3 py-2 text-right">{lang === 'el' ? 'Δ Παρ.' : 'Δ Benefit'}</th>}
              {props.showCfStatus && <th className="px-3 py-2">{lang === 'el' ? 'Κατάσταση CF' : 'CF status'}</th>}
              {props.rowAction && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-[12px]">{r.date ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{r.voucher_code ?? '—'}</td>
                <td className="px-3 py-2">{r.employee_name ?? <span className="text-ink-faint">—</span>}</td>
                <td className="px-3 py-2 text-right num">{moneyFull(r.subtotal_cents, lang)}</td>
                <td className="px-3 py-2 text-right num text-brand">{moneyFull(r.benefit_cents, lang)}</td>
                {props.showDeltas && (
                  <td className={`px-3 py-2 text-right num ${r.subtotal_delta && r.subtotal_delta !== 0 ? 'text-danger' : ''}`}>
                    {r.subtotal_delta != null && r.subtotal_delta !== 0
                      ? (r.subtotal_delta > 0 ? '+' : '') + moneyFull(r.subtotal_delta, lang)
                      : '—'}
                  </td>
                )}
                {props.showDeltas && (
                  <td className={`px-3 py-2 text-right num ${r.benefit_delta && r.benefit_delta !== 0 ? 'text-danger' : ''}`}>
                    {r.benefit_delta != null && r.benefit_delta !== 0
                      ? (r.benefit_delta > 0 ? '+' : '') + moneyFull(r.benefit_delta, lang)
                      : '—'}
                  </td>
                )}
                {props.showCfStatus && <td className="px-3 py-2 text-[12px] text-ink-soft">{r.cf_status ?? '—'}</td>}
                {props.rowAction && <td className="px-3 py-2 text-right">{props.rowAction(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReconcilePage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token
  const navigate = useNavigate()

  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<{ bill: boolean; attn: boolean; info: boolean }>({ bill: false, attn: true, info: false })
  const toggle = (k: 'bill' | 'attn' | 'info') => setExpanded((s) => ({ ...s, [k]: !s[k] }))

  async function run() {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/cf-reconcile?companyId=${selectedId}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      setData(await r.json())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to run') }
    finally { setLoading(false) }
  }

  // Backfill from GO via the BACKGROUND function (15-min ceiling vs 26s sync).
  async function backfill() {
    if (!token) return
    setSyncing(true); setSyncMsg(L('Backfill ξεκίνησε — τρέχει στο παρασκήνιο. Θα ανανεωθεί σε 60s…', 'Backfill started — running in background. Will refresh in 60s…'))
    try {
      const r = await fetch('/api/cf-sync-trigger-background', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ since: from, dryRun: false }),
      })
      if (r.status !== 202 && !r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      setTimeout(async () => {
        await run()
        setSyncMsg(L('Backfill ολοκληρώθηκε — ελέγξτε τα αποτελέσματα παρακάτω.', 'Backfill done — check results below.'))
        setSyncing(false)
      }, 60000)
    } catch (e) {
      setSyncMsg(`Sync failed: ${e instanceof Error ? e.message : 'unknown'}`)
      setSyncing(false)
    }
  }

  // Row action — re-sync ONE date. Hits the same background trigger scoped
  // to that day. Cheap; the upsert is idempotent.
  async function resyncDate(date: string | null) {
    if (!token || !date) return
    setSyncMsg(L(`Επανασυγχρονισμός ${date} ξεκίνησε…`, `Re-sync for ${date} started…`))
    try {
      const r = await fetch('/api/cf-sync-trigger-background', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ since: date, dryRun: false }),
      })
      if (r.status !== 202 && !r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      setSyncMsg(L(`Επανασυγχρονισμός ${date} ξεκίνησε. Πατήστε «Σύγκριση» σε 30–60s.`, `Re-sync for ${date} started. Click "Reconcile" in 30–60s.`))
    } catch (e) {
      setSyncMsg(`Re-sync failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  // Navigate to benefit creation pre-filled with the orphan code + dates.
  // BenefitEditPage may not read these query params yet — follow-up ticket.
  function retroBenefit(code: string, firstSeen: string | null, lastSeen: string | null) {
    const qs = new URLSearchParams({
      voucher_code: code,
      ...(firstSeen ? { from: firstSeen } : {}),
      ...(lastSeen ? { to: lastSeen } : {}),
      reason: 'retro',
    })
    navigate(`/company/benefits/new?${qs.toString()}`)
  }

  // Derived summaries for the headline subtitles.
  const summary = useMemo(() => {
    if (!data) return null
    return {
      // Gross is what's shown for the "before discount" subline; net is the
      // headline number.
      toBillTotal: moneyFull(data.headline.toBill.benefit_cents, lang),
      attnPieces: [
        data.headline.needsAttention.missingKnownVoucher_count > 0
          ? L(`${data.headline.needsAttention.missingKnownVoucher_count} χαμένες στο CF`, `${data.headline.needsAttention.missingKnownVoucher_count} missing in CF`)
          : null,
        data.headline.needsAttention.mismatch_count > 0
          ? L(`${data.headline.needsAttention.mismatch_count} διαφορές ποσών`, `${data.headline.needsAttention.mismatch_count} amount mismatches`)
          : null,
        data.headline.needsAttention.missingInGo_count > 0
          ? L(`${data.headline.needsAttention.missingInGo_count} χαμένες στο GO`, `${data.headline.needsAttention.missingInGo_count} missing in GO`)
          : null,
      ].filter(Boolean).join(' · ') || L('Όλα καθαρά.', 'All clean.'),
      infoPieces: [
        data.headline.forInfo.noVoucher_count > 0
          ? L(`${data.headline.forInfo.noVoucher_count} χωρίς voucher`, `${data.headline.forInfo.noVoucher_count} no voucher`)
          : null,
        data.headline.forInfo.orphan_count > 0
          ? L(`${data.headline.forInfo.orphan_count} κωδικοί εκτός CF`, `${data.headline.forInfo.orphan_count} codes outside CF`)
          : null,
        data.headline.forInfo.crossCompany_count > 0
          ? L(`${data.headline.forInfo.crossCompany_count} άλλων εταιρειών`, `${data.headline.forInfo.crossCompany_count} other companies`)
          : null,
      ].filter(Boolean).join(' · ') || L('Τίποτα για ενημέρωση.', 'Nothing informational.'),
    }
  }, [data, lang])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Αντιστοίχιση', 'Reconciliation')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">
            {L(
              'Για αυτή την εταιρεία και αυτή την περίοδο: τι να τιμολογήσετε, και υπάρχει κάτι που λείπει ή φαίνεται περίεργο πριν στείλετε το τιμολόγιο;',
              'For this company and date range: what should you bill, and is anything missing or off before you send the invoice?'
            )}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Από', 'From')}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold mb-1">{L('Έως', 'To')}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 px-3 bg-surface border border-line rounded-xs text-[13px] font-mono" />
          </div>
          <Btn variant="primary" size="md" disabled={loading} onClick={run}>
            <Icon name="check" /><span>{loading ? L('Εκτέλεση…', 'Running…') : L('Σύγκριση', 'Reconcile')}</span>
          </Btn>
          <Btn variant="secondary" size="md" disabled={syncing} onClick={backfill}>
            <Icon name="history" /><span>{syncing ? L('Backfill…', 'Backfilling…') : L('Backfill από GO', 'Backfill from GO')}</span>
          </Btn>
        </div>
      </div>

      {syncMsg && (
        <div className={`rounded-md border px-4 py-3 text-sm ${syncMsg.startsWith('Sync failed') || syncMsg.startsWith('Re-sync failed') ? 'border-danger/40 bg-danger/5 text-danger' : 'border-success/40 bg-success/5 text-success'}`}>
          {syncMsg}
        </div>
      )}
      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {!data && !loading && (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center text-ink-faint">
          {L('Πατήστε «Σύγκριση» για να τρέξει ο έλεγχος ζωντανά από το GonnaOrder.', 'Click "Reconcile" to run the check live against GonnaOrder.')}
        </div>
      )}

      {data && summary && (
        <div className="space-y-3">
          {/* TO BILL — the green pile.
              Headline number = NET benefit (after vendor discount).
              Subline shows the gross + discount for transparency. */}
          <HeadlineCard
            tone="success"
            icon="check"
            title={L('Προς τιμολόγηση', 'To bill')}
            count={data.headline.toBill.count}
            subline={data.headline.toBill.discount_cents > 0
              ? L(
                  `Καθαρή παροχή ${moneyFull(data.headline.toBill.benefit_net_cents, lang)} · μικτό ${moneyFull(data.headline.toBill.benefit_gross_cents, lang)} − έκπτωση ${data.discount?.pct ?? 0}% (${moneyFull(data.headline.toBill.discount_cents, lang)})`,
                  `Net benefit ${moneyFull(data.headline.toBill.benefit_net_cents, lang)} · gross ${moneyFull(data.headline.toBill.benefit_gross_cents, lang)} − ${data.discount?.pct ?? 0}% discount (${moneyFull(data.headline.toBill.discount_cents, lang)})`
                )
              : L(
                  `Παροχή ${summary.toBillTotal} · σύνολο ${moneyFull(data.headline.toBill.subtotal_cents, lang)}`,
                  `Benefit ${summary.toBillTotal} · subtotal ${moneyFull(data.headline.toBill.subtotal_cents, lang)}`
                )
            }
            expanded={expanded.bill}
            onToggle={() => toggle('bill')}
          >
            <BucketTable
              title={L('Παραγγελίες προς τιμολόγηση', 'Billable orders')}
              rows={data.buckets.matched}
              totalCount={data.headline.toBill.count}
              lang={lang}
            />
          </HeadlineCard>

          {/* NEEDS ATTENTION — the amber pile */}
          <HeadlineCard
            tone={data.headline.needsAttention.count > 0 ? 'warn' : 'success'}
            icon="bell"
            title={L('Χρειάζονται προσοχή', 'Needs attention')}
            count={data.headline.needsAttention.count}
            subline={summary.attnPieces}
            expanded={expanded.attn}
            onToggle={() => toggle('attn')}
          >
            <BucketTable
              title={L('Στο GO, λείπουν από CF (γνωστός κωδικός)', 'In GO, missing from CF (known voucher)')}
              blurb={L('Πραγματικό κενό λήψης. Πατήστε «Resync» στη γραμμή ή κάντε γενικό Backfill.', 'Real ingestion gap. Click "Resync" on the row, or run Backfill above.')}
              rows={data.buckets.missingKnownVoucher}
              totalCount={data.headline.needsAttention.missingKnownVoucher_count}
              rowAction={(r) => (
                <button
                  type="button"
                  className="text-[11.5px] font-semibold text-brand hover:underline"
                  onClick={() => resyncDate(r.date)}
                >
                  {L('Resync', 'Resync')}
                </button>
              )}
              lang={lang}
            />
            <BucketTable
              title={L('Διαφορές ποσών', 'Amount mismatches')}
              blurb={L('Η παραγγελία υπάρχει και στις δύο πλευρές αλλά τα ποσά δεν συμφωνούν.', 'Same order on both sides but amounts disagree.')}
              rows={data.buckets.missingAmountMismatch}
              totalCount={data.headline.needsAttention.mismatch_count}
              showDeltas
              lang={lang}
            />
            <BucketTable
              title={L('Στο CF, λείπουν από GO', 'In CF, missing from GO')}
              blurb={L('Συχνά είναι θέμα παραθύρου/κατάστασης στο GO. Πατήστε «Resync» αν θέλετε να ξανατραβήξετε.', 'Usually a status/window quirk on GO. Click "Resync" to refetch.')}
              rows={data.buckets.missingInGo}
              totalCount={data.headline.needsAttention.missingInGo_count}
              showCfStatus
              rowAction={(r) => (
                <button
                  type="button"
                  className="text-[11.5px] font-semibold text-brand hover:underline"
                  onClick={() => resyncDate(r.date)}
                >
                  {L('Resync', 'Resync')}
                </button>
              )}
              lang={lang}
            />
          </HeadlineCard>

          {/* FOR INFO — the grey pile */}
          <HeadlineCard
            tone="info"
            icon="history"
            title={L('Προς ενημέρωση', 'For info only')}
            count={data.headline.forInfo.count}
            subline={summary.infoPieces}
            expanded={expanded.info}
            onToggle={() => toggle('info')}
          >
            {/* Orphan code summary — actionable */}
            {data.orphanCodeSummary.length > 0 && (
              <div>
                <h3 className="font-display text-[15px] font-semibold mb-1">
                  {L('Ορφανοί κωδικοί voucher', 'Orphan voucher codes')}
                  <span className="text-ink-faint font-mono text-[13px] ml-2">({data.orphanCodeSummary.length})</span>
                </h3>
                <p className="text-[12.5px] text-ink-soft mb-2">
                  {L(
                    'Κωδικοί που δεν αντιστοιχούν σε υπάλληλο στο CF — πιθανώς διανεμημένοι εκτός CF. Φτιάξτε retro-benefit για να ενταχθούν στην τιμολόγηση.',
                    'Codes that do not map to any CF employee — likely handed out outside CF. Create a retro-benefit to include them in billing.'
                  )}
                </p>
                <div className="bg-white border border-line rounded-xs overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead className="bg-bg/40 border-b border-line">
                      <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                        <th className="px-3 py-2">{L('Κωδικός', 'Code')}</th>
                        <th className="px-3 py-2 text-right">{L('Παραγγελίες', 'Orders')}</th>
                        <th className="px-3 py-2 text-right">{L('Σύνολο', 'Total')}</th>
                        <th className="px-3 py-2 text-right">{L('Παροχή', 'Benefit')}</th>
                        <th className="px-3 py-2">{L('Διάστημα', 'Range')}</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.orphanCodeSummary.map((o) => (
                        <tr key={o.code}>
                          <td className="px-3 py-2 font-mono text-[12px]">{o.code}</td>
                          <td className="px-3 py-2 text-right num">{o.count}</td>
                          <td className="px-3 py-2 text-right num">{moneyFull(o.subtotal_cents, lang)}</td>
                          <td className="px-3 py-2 text-right num text-brand">{moneyFull(o.benefit_cents, lang)}</td>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-ink-soft">
                            {o.first_seen ?? '—'}{o.first_seen !== o.last_seen ? ` → ${o.last_seen ?? '—'}` : ''}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-[11.5px] font-semibold text-brand hover:underline"
                              onClick={() => retroBenefit(o.code, o.first_seen, o.last_seen)}
                            >
                              {L('Retro-benefit', 'Retro-benefit')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <BucketTable
              title={L('Παραγγελίες χωρίς voucher (πλήρης τιμή)', 'Orders with no voucher (full price)')}
              blurb={L('Ο υπάλληλος πλήρωσε χωρίς να χρησιμοποιήσει τον κωδικό του. Δεν τιμολογούνται.', 'Employee paid without using their voucher. Not billed to the company.')}
              rows={data.buckets.noVoucher}
              totalCount={data.headline.forInfo.noVoucher_count}
              lang={lang}
            />
            <BucketTable
              title={L('Άλλων εταιρειών (μοιραζόμενο κατάστημα)', 'Other companies (shared store)')}
              blurb={L('Παραγγελίες υπαλλήλων άλλων εταιρειών που μοιράζονται το ίδιο GO κατάστημα.', 'Orders by employees of other companies sharing this GO store.')}
              rows={data.buckets.crossCompany}
              totalCount={data.headline.forInfo.crossCompany_count}
              lang={lang}
            />
          </HeadlineCard>

          {/* Happy-path footer */}
          {data.headline.needsAttention.count === 0 && data.headline.toBill.count > 0 && (
            <div className="rounded-md border border-success/40 bg-success/5 px-4 py-4 text-center">
              <div className="font-display text-[15px] font-semibold text-success">
                {L('Έτοιμο για τιμολόγηση.', 'Ready to invoice.')}
              </div>
              <p className="text-[12.5px] text-ink-soft mt-1">
                {data.headline.toBill.discount_cents > 0
                  ? L(
                      `Καμία διαφορά. ${data.headline.toBill.count} παραγγελίες, καθαρό προς τιμολόγηση ${moneyFull(data.headline.toBill.benefit_net_cents, lang)} (μικτό ${moneyFull(data.headline.toBill.benefit_gross_cents, lang)}).`,
                      `No discrepancies. ${data.headline.toBill.count} orders, net to invoice ${moneyFull(data.headline.toBill.benefit_net_cents, lang)} (gross ${moneyFull(data.headline.toBill.benefit_gross_cents, lang)}).`
                    )
                  : L(
                      `Καμία διαφορά. ${data.headline.toBill.count} παραγγελίες, παροχή ${moneyFull(data.headline.toBill.benefit_cents, lang)} προς τιμολόγηση.`,
                      `No discrepancies. ${data.headline.toBill.count} orders, ${moneyFull(data.headline.toBill.benefit_cents, lang)} benefit to bill.`
                    )}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
