// Generate a PDF invoice for a (company × vendor × month) bucket. Lightweight
// jsPDF + autotable; client-side so no extra Netlify function needed. The
// numbers come from cf-invoices (already aggregated) — we just format + lay
// them out.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { moneyFull } from './specui'

type InvoiceRow = {
  vendor_name: string
  month: string                 // YYYY-MM
  orders: number
  gross: number                 // cents
  benefit: number               // cents — what's billable
  extra: number                 // cents — paid by employees, not billed
}
type Company = { name: string; vat_number: string | null; billing_email: string | null }
type Vendor = { name: string; legal_name: string | null; vat?: string | null }

const monthLabel = (m: string, lang: 'el' | 'en') => {
  const [y, mo] = m.split('-')
  const d = new Date(Number(y), Number(mo) - 1, 1)
  return d.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { month: 'long', year: 'numeric' })
}

export function downloadInvoicePdf(opts: {
  company: Company
  vendor: Vendor
  invoice: InvoiceRow
  lineItems?: { date: string; employee: string; amount: number }[]   // optional per-order breakdown
  lang: 'el' | 'en'
}) {
  const { company, vendor, invoice, lineItems, lang } = opts
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 18
  let y = margin

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(45, 79, 60) // brand
  doc.text('orexi', margin, y + 2)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120, 130, 125)
  doc.text(L('Παροχές διατροφής για επιχειρήσεις', 'Food benefits for businesses'), margin, y + 7)

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(26, 46, 36)
  doc.text(L('ΤΙΜΟΛΟΓΙΟ', 'INVOICE'), pageW - margin, y + 2, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 130, 125)
  doc.text(`${invoice.vendor_name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-${invoice.month}-${(company.vat_number ?? '000').slice(-4)}`, pageW - margin, y + 7, { align: 'right' })
  doc.text(L('Έκδοση: ', 'Issued: ') + new Date().toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB'), pageW - margin, y + 11, { align: 'right' })
  y += 20

  // Divider
  doc.setDrawColor(227, 222, 212); doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // Parties
  doc.setFontSize(8).setTextColor(141, 155, 147)
  doc.text(L('ΑΠΟ', 'FROM'), margin, y)
  doc.text(L('ΠΡΟΣ', 'TO'), pageW / 2, y)
  y += 5
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(26, 46, 36)
  doc.text(vendor.name, margin, y)
  doc.text(company.name, pageW / 2, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90, 107, 99)
  y += 5
  if (vendor.legal_name) doc.text(vendor.legal_name, margin, y)
  if (company.vat_number) doc.text(`${L('ΑΦΜ', 'VAT')}: ${company.vat_number}`, pageW / 2, y)
  y += 5
  if (vendor.vat) doc.text(`${L('ΑΦΜ', 'VAT')}: ${vendor.vat}`, margin, y)
  if (company.billing_email) doc.text(company.billing_email, pageW / 2, y)
  y += 10

  // Period
  doc.setFontSize(10).setTextColor(26, 46, 36)
  doc.setFont('helvetica', 'bold')
  doc.text(L('Περίοδος: ', 'Period: ') + monthLabel(invoice.month, lang), margin, y)
  y += 8

  // Summary block
  autoTable(doc, {
    startY: y,
    head: [[L('Περιγραφή', 'Description'), L('Παραγγελίες', 'Orders'), L('Χρέωση παροχής', 'Billable benefit')]],
    body: [[
      L(`Παροχή σίτισης για ${invoice.vendor_name}`, `Food benefit usage at ${invoice.vendor_name}`),
      String(invoice.orders),
      moneyFull(invoice.benefit, lang),
    ]],
    foot: [[
      L('Σύνολο προς πληρωμή', 'Total payable'),
      '',
      moneyFull(invoice.benefit, lang),
    ]],
    headStyles: { fillColor: [45, 79, 60], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [232, 237, 231], textColor: [26, 46, 36], fontStyle: 'bold' },
    bodyStyles: { textColor: [26, 46, 36] },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    margin: { left: margin, right: margin },
  })
  // jspdf-autotable types may not include lastAutoTable on the doc; cast.
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  y = (last?.finalY ?? y) + 10

  // Note
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(141, 155, 147)
  const note = L(
    'Σημείωση: Επιπλέον €' + (invoice.extra / 100).toFixed(2) + ' πληρώθηκαν απευθείας από τους υπαλλήλους και δεν περιλαμβάνονται σε αυτό το τιμολόγιο.',
    'Note: An additional €' + (invoice.extra / 100).toFixed(2) + ' was paid directly by employees and is not included in this invoice.',
  )
  doc.text(doc.splitTextToSize(note, pageW - margin * 2), margin, y)
  y += 10

  // Optional line items
  if (lineItems && lineItems.length > 0) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(26, 46, 36)
    doc.text(L('Αναλυτικά', 'Line items'), margin, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [[L('Ημ/νία', 'Date'), L('Υπάλληλος', 'Employee'), L('Παροχή', 'Benefit')]],
      body: lineItems.map((li) => [li.date, li.employee, moneyFull(li.amount, lang)]),
      headStyles: { fillColor: [232, 237, 231], textColor: [26, 46, 36], fontStyle: 'bold' },
      bodyStyles: { textColor: [90, 107, 99], fontSize: 8 },
      columnStyles: { 0: { cellWidth: 25 }, 2: { halign: 'right' } },
      margin: { left: margin, right: margin },
    })
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(141, 155, 147)
  doc.text(L('Παρήχθη αυτόματα από την πλατφόρμα orexi · ', 'Auto-generated by orexi · ') + new Date().toISOString().slice(0, 10), pageW / 2, pageH - 10, { align: 'center' })

  const filename = `invoice-${company.name.replace(/[^a-z0-9]/gi, '_')}-${invoice.vendor_name.replace(/[^a-z0-9]/gi, '_')}-${invoice.month}.pdf`
  doc.save(filename)
}
