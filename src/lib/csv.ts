// Tiny CSV export utility — no deps. Quotes any cell containing comma, quote,
// or newline; doubles internal quotes. Triggers a browser download.

type Cell = string | number | null | undefined

function quote(v: Cell): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(quote).join(',')]
  for (const r of rows) lines.push(r.map(quote).join(','))
  // BOM so Excel opens UTF-8 (Greek) correctly
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const csv = toCsv(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
