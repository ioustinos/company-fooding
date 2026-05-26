import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, KPI, ActIcon, moneyFull } from '../../lib/specui'
import type { IconName } from '../../lib/specui'
import { SpendChart } from '../../lib/specCharts'

type Recent = { kind: 'order'; who: string; where: string; amount: number; at: string | null }
type Dash = {
  totals: { orders: number; gross: number; benefit: number; topup: number; employees: number }
  trend: { date: string; gross: number; benefit: number; orders: number }[]
  recent: Recent[]
}
type ActivityEvent = { id: string; kind: string; actor_email: string | null; summary_el: string | null; summary_en: string | null; created_at: string }

// Build a continuous daily series from the earliest order day (or `fromIso`
// if the trend is empty) through today, zero-filling gaps so the chart reads
// as a real timeline rather than just the last N days.
function buildSeries(trend: Dash['trend'], fromIso: string) {
  const byDate = new Map(trend.map((t) => [t.date, t]))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const startIso = trend.length > 0 ? trend[0].date : fromIso
  const start = new Date(startIso + 'T00:00:00')
  const out: { date: string; benefit: number; extra: number }[] = []
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    const row = byDate.get(iso)
    const benefit = row?.benefit ?? 0
    const gross = row?.gross ?? 0
    out.push({ date: iso, benefit, extra: Math.max(0, gross - benefit) })
  }
  return out
}

function fmtShort(iso: string, lang: 'el' | 'en') {
  return new Date(iso + 'T00:00:00').toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short' })
}

export default function CompanyDashboard() {
  const { session, user } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [data, setData] = useState<Dash | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const from = '2026-03-01'
  const to = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!session?.access_token || !selectedId) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const [dashRes, actRes] = await Promise.all([
          fetch(`/api/cf-dashboard?companyId=${selectedId}&from=${from}&to=${to}`, { headers: { authorization: `Bearer ${session.access_token}` } }),
          fetch(`/api/cf-activity?companyId=${selectedId}&limit=8`, { headers: { authorization: `Bearer ${session.access_token}` } }),
        ])
        if (!dashRes.ok) { const b = await dashRes.json().catch(() => ({})); throw new Error(b.error || `HTTP ${dashRes.status}`) }
        setData(await dashRes.json())
        if (actRes.ok) { const d = await actRes.json(); setActivity(d.events ?? []) }
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [session?.access_token, selectedId])

  function actKind(kind: string): 'order' | 'signup' | 'invoice' | 'benefit_start' | 'topup_failed' {
    if (kind.startsWith('employee.')) return 'signup'
    if (kind.startsWith('benefit.assigned')) return 'benefit_start'
    if (kind.startsWith('benefit.')) return 'invoice'
    if (kind.startsWith('group.') || kind.startsWith('company.')) return 'order'
    return 'order'
  }
  function relTime(iso: string): string {
    const t = new Date(iso).getTime(); const now = Date.now()
    const diffMin = Math.round((now - t) / 60000)
    if (diffMin < 1) return L('μόλις τώρα', 'just now')
    if (diffMin < 60) return L(`πριν ${diffMin} λεπτά`, `${diffMin} min ago`)
    const h = Math.round(diffMin / 60); if (h < 24) return L(`πριν ${h} ώρες`, `${h}h ago`)
    const d = Math.round(h / 24); return L(`πριν ${d} μέρες`, `${d}d ago`)
  }

  const firstName = (user?.fullName || user?.email || 'there').split(/[ @]/)[0]
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return L('Καλημέρα', 'Good morning')
    if (h < 18) return L('Καλησπέρα', 'Good afternoon')
    return L('Καλό βράδυ', 'Good evening')
  })()

  const series = data ? buildSeries(data.trend, from) : []
  const windowTotal = series.reduce((a, d) => a + d.benefit + d.extra, 0)
  const seriesStart = series[0]?.date
  const seriesEnd = series[series.length - 1]?.date
  const benefitShare = data && data.totals.gross > 0
    ? Math.round((data.totals.benefit / data.totals.gross) * 100) : 0
  const orderDays = data ? data.trend.length : 0
  const avgPerDay = data && orderDays > 0 ? Math.round(data.totals.orders / orderDays) : 0

  const quick: { to: string; title: string; sub: string; icon: IconName; tone: 'brand' | 'accent' | 'warn' }[] = [
    { to: '/company/employees', title: L('Προσκαλέστε υπαλλήλους', 'Invite employees'), sub: L('Με email ή μαζικά από CSV.', 'Via email or CSV import.'), icon: 'users', tone: 'brand' },
    { to: '/company/benefits/new', title: L('Δημιουργία παροχής', 'Create a benefit'), sub: L('Μηνιαία, εβδομαδιαία ή one-off.', 'Monthly, weekly, or one-off.'), icon: 'wallet', tone: 'accent' },
    { to: '/company/reports', title: L('Αναφορές & δαπάνες', 'Reports & spend'), sub: L('Αναλυτική εικόνα χρήσης.', 'Detailed usage breakdown.'), icon: 'file', tone: 'warn' },
  ]

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">
          {greeting}, <span className="italic text-ink-soft">{firstName}</span>
        </h1>
        <p className="text-ink-soft mt-2 text-[15px]">
          {L('Σύντομη εικόνα των παροχών και της δραστηριότητας.', 'A quick read on benefits and activity.')}
        </p>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI label={L('Ενεργοί εργαζόμενοι', 'Active employees')} value={data.totals.employees}
              tone="brand" icon="users" sub={L('με παραγγελία στην περίοδο', 'ordered this period')} />
            <KPI label={L('Συνολική δαπάνη', 'Total spend')} value={moneyFull(data.totals.gross, lang)}
              tone="accent" icon="wallet" sub={L(`από ${from}`, `since ${from}`)} />
            <KPI label={L('Καλύφθηκε από παροχή', 'Covered by benefit')} value={moneyFull(data.totals.benefit, lang)}
              tone="success" icon="chart" sub={L(`${benefitShare}% της δαπάνης`, `${benefitShare}% of spend`)} />
            <KPI label={L('Παραγγελίες', 'Orders')} value={data.totals.orders}
              tone="warn" icon="shop" sub={L(`μ.ό. ${avgPerDay}/ημέρα`, `${avgPerDay}/day avg`)} />
          </div>

          <div className="grid lg:grid-cols-[3fr_2fr] gap-6">
            {/* chart */}
            <div className="bg-surface border border-line rounded-md shadow-sm p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="font-display text-[20px] font-semibold">{L('Δαπάνες ανά ημέρα', 'Spend per day')}</h2>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft"><span className="w-2.5 h-2.5 rounded-xs bg-brand"></span>{L('Καλύπτεται από παροχή', 'Covered by benefit')}</span>
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft"><span className="w-2.5 h-2.5 rounded-xs bg-accent"></span>{L('Επιπλέον από υπαλλήλους', 'Extra paid by employees')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[22px] font-semibold">{moneyFull(windowTotal, lang)}</div>
                  <div className="text-[11px] text-ink-faint">{L(`σύνολο ${series.length} ημερών`, `${series.length}-day total`)}</div>
                </div>
              </div>
              <SpendChart data={series} lang={lang} height={180} />
              <div className="flex justify-between mt-1 num text-[10px] text-ink-faint">
                <span>{seriesStart ? fmtShort(seriesStart, lang) : ''}</span>
                <span>{seriesEnd ? fmtShort(seriesEnd, lang) : ''}</span>
              </div>
            </div>

            {/* activity */}
            <div className="bg-surface border border-line rounded-md shadow-sm">
              <div className="flex items-center justify-between p-5 border-b border-line">
                <h2 className="font-display text-[20px] font-semibold">{L('Δραστηριότητα', 'Activity')}</h2>
                <Link to="/company/activity" className="text-[12.5px] text-brand font-medium hover:underline">{L('Όλα', 'View all')}</Link>
              </div>
              <div className="divide-y divide-line">
                {activity.length === 0 && data.recent.length === 0 && (
                  <div className="p-6 text-center text-[13px] text-ink-faint">{L('Καμία δραστηριότητα ακόμη', 'No activity yet')}</div>
                )}
                {activity.map((a) => (
                  <div key={a.id} className="p-4 flex items-start gap-3">
                    <ActIcon kind={actKind(a.kind)} />
                    <div className="flex-1 min-w-0 text-[13.5px] text-ink leading-[20px]">
                      <div>{lang === 'el' ? (a.summary_el || a.kind) : (a.summary_en || a.kind)}</div>
                      <div className="text-[11.5px] text-ink-faint font-mono mt-0.5">{relTime(a.created_at)} · {a.actor_email ?? 'system'}</div>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && data.recent.map((a, i) => (
                  <div key={`o-${i}`} className="p-4 flex items-start gap-3">
                    <ActIcon kind={a.kind} />
                    <div className="flex-1 min-w-0 text-[13.5px] text-ink leading-[20px]">
                      <div><b>{a.who}</b> {L('παραγγελία', 'ordered at')} <b>{a.where}</b> · <span className="num">{moneyFull(a.amount, lang)}</span></div>
                      <div className="text-[11.5px] text-ink-faint font-mono mt-0.5">{a.at}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* quick actions */}
          <div>
            <h2 className="font-display text-[20px] font-semibold mb-3">{L('Γρήγορες ενέργειες', 'Quick actions')}</h2>
            <div className="grid md:grid-cols-3 gap-3">
              {quick.map((q) => (
                <Link key={q.to} to={q.to} className="group bg-surface border border-line rounded-md p-5 hover:border-ink-soft transition flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-sm ${q.tone === 'brand' ? 'bg-brand-soft text-brand' : q.tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-[#FBF1DA] text-[#A37620]'} flex items-center justify-center shrink-0`}>
                    <Icon name={q.icon} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[14.5px] flex items-center gap-1.5">
                      {q.title}
                      <span className="text-ink-faint group-hover:text-ink transition"><Icon name="chevron_r" /></span>
                    </div>
                    <div className="text-[12.5px] text-ink-soft mt-0.5">{q.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
