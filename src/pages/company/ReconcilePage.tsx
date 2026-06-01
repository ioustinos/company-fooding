import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Btn, KPI, moneyFull } from '../../lib/specui'

type CfOrder = { external_order_id: string; subtotal: number; benefit_applied: number; status: string; delivery_date: string | null }
type GoLite = { id: string; subtotal_cents: number; benefit_cents: number; date: string | null; status: string }
type Mismatch = { id: string; cf: CfOrder; go: GoLite; subtotal_delta: number; benefit_delta: number }
type Data = {
  period: { from: string; to: string }
  storeIds: string[]
  counts: { cf: number; go: number; missingInCf: number; missingInGo: number; mismatches: number }
  missingInCf: GoLite[]
  missingInGo: CfOrder[]
  mismatches: Mismatch[]
}

export default function ReconcilePage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

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

  // Backfill from GO. Calls the BACKGROUND function (15-min Netlify timeout
  // ceiling — sync functions only get 26s, multi-store paginated GO pulls
  // bust that). Background returns 202 immediately; reconcile re-runs after
  // a short delay to pick up the new rows.
  async function backfill() {
    if (!token) return
    setSyncing(true); setSyncMsg(L('Backfill ξεκίνησε — τρέχει στο παρασκήνιο. Θα ανανεωθεί σε 60s…', 'Backfill started — running in background. Will refresh in 60s…'))
    try {
      const r = await fetch('/api/cf-sync-trigger-background', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ since: from, dryRun: false }),
      })
      // Background functions always return 202; pre-check errors (400/403/405)
      // come back with a JSON body.
      if (r.status !== 202 && !r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      // Poll: re-run reconcile after 60s to see the new rows.
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

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Αντιστοίχιση', 'Reconciliation')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Σύγκριση παραγγελιών CF ↔ GonnaOrder. Εντοπίζει χαμένα webhooks και διαφορές ποσών.', 'Diff CF orders against GonnaOrder. Catches dropped webhooks and amount mismatches.')}</p>
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

      {syncMsg && <div className={`rounded-md border px-4 py-3 text-sm ${syncMsg.startsWith('Sync failed') ? 'border-danger/40 bg-danger/5 text-danger' : 'border-success/40 bg-success/5 text-success'}`}>{syncMsg}</div>}
      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {!data && !loading && (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center text-ink-faint">
          {L('Πατήστε «Σύγκριση» για να τρέξει ο έλεγχος. Το περιστατικό φτιάχνει το αίτημα ζωντανά στο GonnaOrder.', 'Click "Reconcile" to run. It hits GonnaOrder live for the period.')}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KPI label={L('Στο CF', 'In CF')} value={data.counts.cf} tone="brand" icon="file" />
            <KPI label={L('Στο GO', 'In GO')} value={data.counts.go} tone="accent" icon="shop" />
            <KPI label={L('Χαμένα στο CF', 'Missing in CF')} value={data.counts.missingInCf} tone={data.counts.missingInCf > 0 ? 'danger' : 'success'} icon="bell" />
            <KPI label={L('Χαμένα στο GO', 'Missing in GO')} value={data.counts.missingInGo} tone={data.counts.missingInGo > 0 ? 'warn' : 'success'} icon="bell" />
            <KPI label={L('Διαφορές ποσών', 'Mismatches')} value={data.counts.mismatches} tone={data.counts.mismatches > 0 ? 'danger' : 'success'} icon="chart" />
          </div>

          {/* Missing in CF — webhook drops */}
          {data.missingInCf.length > 0 && (
            <div className="bg-surface border border-line rounded-md shadow-sm">
              <div className="p-4 border-b border-line">
                <h2 className="font-display text-[18px] font-semibold">{L('Παραγγελίες στο GO που λείπουν από CF', 'Orders in GO missing from CF')}</h2>
                <p className="text-[12.5px] text-ink-soft mt-1">{L('Πιθανώς χαμένο webhook. Το scheduled sync θα τα φέρει στον επόμενο γύρο.', 'Likely dropped webhook. Scheduled sync will pull them on next run.')}</p>
              </div>
              <table className="w-full text-[13px]">
                <thead className="bg-bg/40 border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                    <th className="px-4 py-2">{L('Ημ/νία', 'Date')}</th>
                    <th className="px-4 py-2">{L('GO uuid', 'GO uuid')}</th>
                    <th className="px-4 py-2">{L('Status', 'Status')}</th>
                    <th className="px-4 py-2 text-right">{L('Σύνολο', 'Total')}</th>
                    <th className="px-4 py-2 text-right">{L('Παροχή', 'Benefit')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.missingInCf.map((g) => (
                    <tr key={g.id}>
                      <td className="px-4 py-2 font-mono text-[12px]">{g.date ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-[11.5px] text-ink-soft truncate">{g.id}</td>
                      <td className="px-4 py-2">{g.status}</td>
                      <td className="px-4 py-2 text-right num">{moneyFull(g.subtotal_cents, lang)}</td>
                      <td className="px-4 py-2 text-right num text-brand">{moneyFull(g.benefit_cents, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mismatches — amounts differ */}
          {data.mismatches.length > 0 && (
            <div className="bg-surface border border-line rounded-md shadow-sm">
              <div className="p-4 border-b border-line">
                <h2 className="font-display text-[18px] font-semibold">{L('Διαφορές ποσών', 'Amount mismatches')}</h2>
                <p className="text-[12.5px] text-ink-soft mt-1">{L('Παραγγελίες υπάρχουν και στις δύο πλευρές αλλά τα ποσά δεν συμφωνούν.', 'Same order on both sides but amounts disagree.')}</p>
              </div>
              <table className="w-full text-[13px]">
                <thead className="bg-bg/40 border-b border-line">
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                    <th className="px-4 py-2">{L('Ημ/νία', 'Date')}</th>
                    <th className="px-4 py-2">{L('GO uuid', 'GO uuid')}</th>
                    <th className="px-4 py-2 text-right">{L('CF Σύνολο', 'CF Total')}</th>
                    <th className="px-4 py-2 text-right">{L('GO Σύνολο', 'GO Total')}</th>
                    <th className="px-4 py-2 text-right">{L('Δ Σύνολο', 'Δ Total')}</th>
                    <th className="px-4 py-2 text-right">{L('Δ Παροχή', 'Δ Benefit')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.mismatches.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 font-mono text-[12px]">{m.go.date ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-[11.5px] text-ink-soft truncate">{m.id}</td>
                      <td className="px-4 py-2 text-right num">{moneyFull(m.cf.subtotal, lang)}</td>
                      <td className="px-4 py-2 text-right num">{moneyFull(m.go.subtotal_cents, lang)}</td>
                      <td className={`px-4 py-2 text-right num ${m.subtotal_delta !== 0 ? 'text-danger' : ''}`}>{m.subtotal_delta > 0 ? '+' : ''}{moneyFull(m.subtotal_delta, lang)}</td>
                      <td className={`px-4 py-2 text-right num ${m.benefit_delta !== 0 ? 'text-danger' : ''}`}>{m.benefit_delta > 0 ? '+' : ''}{moneyFull(m.benefit_delta, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.counts.missingInCf === 0 && data.counts.missingInGo === 0 && data.counts.mismatches === 0 && (
            <div className="rounded-md border border-success/40 bg-success/5 px-4 py-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success text-white mb-2"><Icon name="check" size={20} /></div>
              <div className="font-display text-[18px] font-semibold text-success">{L('Όλα συμφωνούν.', 'Everything matches.')}</div>
              <p className="text-[12.5px] text-ink-soft mt-1">{L(`CF και GO έχουν τις ίδιες ${data.counts.cf} παραγγελίες με ταυτόσημα ποσά για την περίοδο.`, `CF and GO agree on all ${data.counts.cf} orders with identical totals for the period.`)}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
