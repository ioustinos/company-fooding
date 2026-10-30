// orexi chart primitives — Recharts wrapped to match the spec's visual language
// (brand-green + accent-orange, mono numerics, no gridlines, soft tooltips).
//
// SpendChart renders stacked benefit+extra bars, with an optional orders line
// overlaid on a right-hand axis, €-formatted left ticks, X ticks showing
// "DD short-weekday", and a month-group row rendered beneath the chart.

import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import type { TooltipProps } from 'recharts'
import { moneyFull } from './specui'

type Point = { date: string; benefit: number; extra: number; orders?: number }
type Lang = 'el' | 'en'

function fmtLong(iso: string, lang: Lang) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// X-axis tick parts — day-of-month on top, 3-letter weekday below.
function tickParts(iso: string, lang: Lang) {
  const d = new Date(iso + 'T00:00:00')
  const day = d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric' })
  const wd  = d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'short' }).replace('.', '')
  return { day, wd }
}

// Custom tick renderer so day + weekday stack cleanly on two lines.
function StackedDateTick(props: { x?: number; y?: number; payload?: { value: string }; lang: Lang }) {
  const { x, y, payload, lang } = props
  if (x == null || y == null || !payload?.value) return null
  const { day, wd } = tickParts(String(payload.value), lang)
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={10} textAnchor="middle" fill="#5A6B63" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={600}>{day}</text>
      <text y={22} textAnchor="middle" fill="#8D9B93" fontSize={9.5} fontFamily="JetBrains Mono, monospace">{wd}</text>
    </g>
  )
}

// Fmt the minimum-reference-line label as "εβδ. ≥ €50" style — short enough
// to sit on the chart without overlapping bars.
function fmtMinLabel(cents: number, lang: Lang) {
  return `≥ ${moneyFull(cents, lang)}`
}

function CustomTooltip({ active, payload, label, lang }: TooltipProps<number, string> & { lang: Lang }) {
  if (!active || !payload || payload.length === 0) return null
  const benefit = Number(payload.find((p) => p.dataKey === 'benefit')?.value ?? 0)
  const extra   = Number(payload.find((p) => p.dataKey === 'extra')?.value ?? 0)
  const orders  = Number(payload.find((p) => p.dataKey === 'orders')?.value ?? 0)
  const total = benefit + extra
  const hasOrders = payload.some((p) => p.dataKey === 'orders')
  return (
    <div className="bg-surface border border-line rounded-md shadow-lg p-3 text-[12px]">
      <div className="font-mono text-[11px] text-ink-faint mb-1.5">{fmtLong(String(label), lang)}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-xs bg-brand"></span>{lang === 'el' ? 'Παροχή' : 'Benefit'}</span>
        <span className="num font-semibold">{moneyFull(benefit, lang)}</span>
      </div>
      <div className="flex items-center justify-between gap-6 mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-xs bg-accent"></span>{lang === 'el' ? 'Επιπλέον' : 'Extra'}</span>
        <span className="num font-semibold">{moneyFull(extra, lang)}</span>
      </div>
      <div className="border-t border-line mt-2 pt-1.5 flex items-center justify-between gap-6">
        <span className="text-ink-soft">{lang === 'el' ? 'Σύνολο' : 'Total'}</span>
        <span className="num font-semibold">{moneyFull(total, lang)}</span>
      </div>
      {hasOrders && (
        <div className="border-t border-line mt-1.5 pt-1.5 flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-0.5 bg-ink-soft"></span>{lang === 'el' ? 'Παραγγελίες' : 'Orders'}</span>
          <span className="num font-semibold">{orders}</span>
        </div>
      )}
    </div>
  )
}

// Build month-group rows for the strip under the chart.
// Returns [{ monthLabel, flexGrow }, …] in chronological order.
function monthGroups(data: Point[], lang: Lang): { label: string; count: number }[] {
  const groups: { ym: string; label: string; count: number }[] = []
  for (const p of data) {
    const d = new Date(p.date + 'T00:00:00')
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { month: 'short', year: 'numeric' })
    const last = groups[groups.length - 1]
    if (last && last.ym === ym) last.count += 1
    else groups.push({ ym, label, count: 1 })
  }
  return groups.map(({ label, count }) => ({ label, count }))
}

export function SpendChart({ data, lang, height = 180, minPerDayCents }: { data: Point[]; lang: Lang; height?: number; minPerDayCents?: number | null }) {
  if (data.length === 0) {
    return <div className="text-center text-[13px] text-ink-faint py-8">{lang === 'el' ? 'Καμία δραστηριότητα' : 'No activity'}</div>
  }
  const hasOrders = data.some((d) => typeof d.orders === 'number')
  const groups = monthGroups(data, lang)
  const hasMin = typeof minPerDayCents === 'number' && minPerDayCents > 0

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: hasOrders ? 10 : 0, left: -10, bottom: 8 }}>
            <CartesianGrid stroke="#E3DED4" vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              // Custom 2-line tick: day number on top, weekday abbrev below.
              tick={(p) => <StackedDateTick {...p} lang={lang} />}
              axisLine={false} tickLine={false} interval={0} height={34} />
            {/* Left axis: €X (money, cents→€ with symbol). */}
            <YAxis
              yAxisId="money"
              tickFormatter={(v) => `€${Math.round((Number(v) || 0) / 100)}`}
              tick={{ fill: '#8D9B93', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false} tickLine={false} width={48} />
            {/* Right axis: order count (dimensionless int). Only rendered when orders are passed. */}
            {hasOrders && (
              <YAxis
                yAxisId="orders"
                orientation="right"
                tickFormatter={(v) => `${Math.round(Number(v) || 0)}`}
                tick={{ fill: '#8D9B93', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            )}
            <Tooltip content={<CustomTooltip lang={lang} />} cursor={{ fill: 'rgba(45,79,60,0.06)' }} />
            <Bar yAxisId="money" dataKey="benefit" stackId="s" fill="#2D4F3C" radius={[2, 2, 0, 0]} />
            <Bar yAxisId="money" dataKey="extra"   stackId="s" fill="#D97948" radius={[2, 2, 0, 0]} />
            {hasOrders && (
              <Line
                yAxisId="orders"
                type="monotone"
                dataKey="orders"
                stroke="#5A6B63"
                strokeWidth={1.5}
                dot={{ r: 2.5, fill: '#5A6B63', strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            )}
            {/* Daily minimum-charge threshold — only rendered when the deal has
                a per-day fixed-amount minimum. */}
            {hasMin && (
              <ReferenceLine
                yAxisId="money"
                y={minPerDayCents as number}
                stroke="#E0A443"
                strokeDasharray="4 3"
                strokeWidth={1.25}
                ifOverflow="extendDomain"
                label={{
                  value: fmtMinLabel(minPerDayCents as number, lang),
                  position: 'insideTopRight',
                  fill: '#A37620',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Month-group row — one flex child per month, growing proportional to
          days-in-month-shown. Visual "bracket" opens UPWARD toward the dates:
          horizontal line at the bottom, side ticks going UP (border-b + border-l
          + border-r + rounded-b-xs). */}
      {groups.length > 0 && (
        <div className="flex mt-1 pl-[48px] pr-[8px]" style={{ paddingRight: hasOrders ? 28 : 0 }}>
          {groups.map((g, i) => (
            <div key={i} className="flex flex-col items-center text-[11px] text-ink-faint font-semibold uppercase tracking-[0.08em]"
                 style={{ flexGrow: g.count, flexBasis: 0 }}>
              <div className="w-full h-[6px] border-b border-l border-r border-line rounded-b-xs" />
              <div className="mt-0.5">{g.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
