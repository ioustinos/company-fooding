// orexi chart primitives — Recharts wrapped to match the spec's visual language
// (brand-green + accent-orange, mono numerics, no gridlines, soft tooltips).
//
// Usage: <SpendChart data={[{ date, benefit, extra }]} lang="el" height={180} />

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { TooltipProps } from 'recharts'
import { moneyFull } from './specui'

type Point = { date: string; benefit: number; extra: number }
type Lang = 'el' | 'en'

function fmtShort(iso: string, lang: Lang) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short' })
}

function CustomTooltip({ active, payload, label, lang }: TooltipProps<number, string> & { lang: Lang }) {
  if (!active || !payload || payload.length === 0) return null
  const benefit = Number(payload.find((p) => p.dataKey === 'benefit')?.value ?? 0)
  const extra = Number(payload.find((p) => p.dataKey === 'extra')?.value ?? 0)
  const total = benefit + extra
  return (
    <div className="bg-surface border border-line rounded-md shadow-lg p-3 text-[12px]">
      <div className="font-mono text-[11px] text-ink-faint mb-1.5">{fmtShort(String(label), lang)}</div>
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
    </div>
  )
}

export function SpendChart({ data, lang, height = 180 }: { data: Point[]; lang: Lang; height?: number }) {
  if (data.length === 0) {
    return <div className="text-center text-[13px] text-ink-faint py-8">{lang === 'el' ? 'Καμία δραστηριότητα' : 'No activity'}</div>
  }
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#E3DED4" vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(v) => fmtShort(String(v), lang)}
            tick={{ fill: '#8D9B93', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => `${Math.round((Number(v) || 0) / 100)}`}
            tick={{ fill: '#8D9B93', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<CustomTooltip lang={lang} />} cursor={{ fill: 'rgba(45,79,60,0.06)' }} />
          <Bar dataKey="benefit" stackId="s" fill="#2D4F3C" radius={[2, 2, 0, 0]} />
          <Bar dataKey="extra"   stackId="s" fill="#D97948" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
