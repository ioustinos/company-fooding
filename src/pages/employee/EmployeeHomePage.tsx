import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, moneyFull } from '../../lib/specui'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'one_time'

type BenefitCard = {
  assignment_id: string
  voucher_code: string | null
  benefit: { id: string; name_el: string; name_en: string; description_el: string | null; description_en: string | null; credit_amount: number; cadence: Cadence; daily_cap: number | null; valid_from: string; valid_to: string | null }
  cycle: { from: string; to: string | null; used: number; remaining: number; percent: number }
}
type Order = { id: string; delivery_date: string | null; subtotal: number; benefit_applied: number; topup_amount: number; status: string; vendors: { name: string } | null }
type VendorMatch = { agreement_id: string; sticker_mode: string; vendor: { id: string; name: string; legal_name: string | null; discount_percentage: number; discount_applies_to: string; tags: string[] | null } | null; windows: { from: string; to: string }[]; shop_ids: string[] }
type Home = { employee: { display_name: string; office: { label_el: string | null; label_en: string | null } | null }; benefits: BenefitCard[]; orders: Order[]; vendors: VendorMatch[] }

const cadenceLabel = (c: Cadence, lang: 'el' | 'en') => ({
  monthly: lang === 'el' ? 'αυτόν τον μήνα' : 'this month',
  weekly: lang === 'el' ? 'αυτή την εβδομάδα' : 'this week',
  daily: lang === 'el' ? 'σήμερα' : 'today',
  one_time: lang === 'el' ? 'συνολικά' : 'total',
}[c])

export default function EmployeeHomePage() {
  const { session, user } = useAuthStore()
  const { lang } = useUIStore()
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

  const firstName = (data?.employee.display_name || user?.fullName || user?.email || 'there').split(/[ @]/)[0]
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return L('Καλημέρα', 'Good morning')
    if (h < 18) return L('Καλησπέρα', 'Good afternoon')
    return L('Καλό βράδυ', 'Good evening')
  })()

  if (loading && !data) return <section className="p-8 max-w-[1100px] mx-auto text-ink-soft">{L('Φόρτωση…', 'Loading…')}</section>
  if (error) return <section className="p-8 max-w-[1100px] mx-auto"><div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div></section>
  if (!data) return null

  return (
    <section className="p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">
          {greeting}, <span className="italic text-ink-soft">{firstName}</span>
        </h1>
        <p className="text-ink-soft mt-2 text-[15px]">
          {L('Δείτε το υπόλοιπό σας και παραγγείλτε από τα συνεργαζόμενα καταστήματα.', 'See your balance and order from your company’s partner vendors.')}
        </p>
      </div>

      {/* Benefit cards */}
      {data.benefits.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="wallet" /></div>
          <div className="font-display text-[20px] font-semibold">{L('Δεν έχετε ενεργές παροχές', 'No active benefits yet')}</div>
          <p className="text-[13px] text-ink-soft mt-1">{L('Μόλις ο διαχειριστής της εταιρείας σας ενεργοποιήσει μια παροχή, θα εμφανιστεί εδώ.', 'When your company admin assigns a benefit, it will appear here.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.benefits.map((c) => {
            const tone = c.cycle.percent < 70 ? 'success' : c.cycle.percent < 95 ? 'warn' : 'danger'
            const barClass = tone === 'success' ? 'bg-success' : tone === 'warn' ? 'bg-warn' : 'bg-danger'
            return (
              <div key={c.assignment_id} className="bg-surface border border-line rounded-md shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11.5px] uppercase tracking-[0.08em] text-ink-faint font-semibold">{cadenceLabel(c.benefit.cadence, lang)}</div>
                    <h3 className="font-display text-[22px] font-semibold mt-1 truncate">{lang === 'el' ? c.benefit.name_el : c.benefit.name_en}</h3>
                    {(c.benefit.description_el || c.benefit.description_en) && (
                      <p className="text-[12.5px] text-ink-soft mt-1">{lang === 'el' ? c.benefit.description_el : c.benefit.description_en}</p>
                    )}
                  </div>
                  <Icon name="wallet" />
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[32px] font-semibold num">{moneyFull(c.cycle.remaining, lang)}</span>
                    <span className="text-[13px] text-ink-soft">{L('διαθέσιμα', 'remaining')}</span>
                  </div>
                  <div className="text-[12px] text-ink-soft num mt-0.5">
                    {L('από', 'of')} {moneyFull(c.benefit.credit_amount, lang)} · {L('χρήση', 'used')} {moneyFull(c.cycle.used, lang)}
                  </div>
                </div>
                <div className="mt-3 h-2 bg-bg rounded-full overflow-hidden">
                  <div className={`h-full ${barClass} transition-all`} style={{ width: `${c.cycle.percent}%` }}></div>
                </div>
                {c.voucher_code && (
                  <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-[12px]">
                    <span className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Κωδικός voucher', 'Voucher code')}</span>
                    <span className="font-mono text-ink">{c.voucher_code}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Vendors quick links */}
      {data.vendors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[20px] font-semibold">{L('Πού μπορώ να παραγγείλω', 'Where can I order')}</h2>
            <Link to="/vendors" className="text-[12.5px] text-brand font-medium hover:underline">{L('Όλα', 'View all')}</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.vendors.slice(0, 3).map((v) => v.vendor && (
              <a key={v.agreement_id} href={v.shop_ids[0] ? `https://gonnaorder.com/${v.shop_ids[0]}` : '#'} target="_blank" rel="noreferrer"
                className="group bg-surface border border-line rounded-md p-5 hover:border-ink-soft transition flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon name="shop" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14.5px] truncate">{v.vendor.name}</div>
                  <div className="text-[11.5px] text-ink-soft truncate">{(v.vendor.tags ?? []).slice(0, 3).join(' · ') || '—'}</div>
                </div>
                <Icon name="chevron_r" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[20px] font-semibold">{L('Πρόσφατες παραγγελίες', 'Recent orders')}</h2>
          <Link to="/orders" className="text-[12.5px] text-brand font-medium hover:underline">{L('Όλες', 'View all')}</Link>
        </div>
        {data.orders.length === 0 ? (
          <div className="rounded-md border border-line bg-surface p-6 text-center text-ink-faint text-[13px]">{L('Καμία παραγγελία ακόμη', 'No orders yet')}</div>
        ) : (
          <div className="bg-surface border border-line rounded-md shadow-sm divide-y divide-line">
            {data.orders.slice(0, 5).map((o) => (
              <div key={o.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${o.status === 'cancelled' ? 'bg-[#F6E1E1] text-danger' : 'bg-brand-soft text-brand'}`}><Icon name="shop" /></div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate">{o.vendors?.name ?? '—'}</div>
                    <div className="text-[11.5px] text-ink-faint font-mono">{o.delivery_date ?? '—'} {o.status === 'cancelled' && <span className="ml-2 text-danger">{L('ακυρώθηκε', 'cancelled')}</span>}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num text-[14px] font-semibold">{moneyFull(o.subtotal, lang)}</div>
                  <div className="num text-[11.5px] text-brand">{L('παροχή', 'benefit')} −{moneyFull(o.benefit_applied, lang)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
