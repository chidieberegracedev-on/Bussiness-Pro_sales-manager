import Decimal from 'decimal.js'
import { formatMoney } from '@/lib/money'
import { formatDateTime } from '@/lib/format'
import type { PurchaseOrder, PurchaseOrderItem } from '@/features/procurement/use-purchase-orders'

interface BusinessCtx {
  id: string
  name: string
  currency_code: string
  currency_exponent: number
  timezone: string
}

interface DocInput {
  order: PurchaseOrder & { supplier_name: string; location_name: string }
  items: PurchaseOrderItem[]
  business: BusinessCtx
  locale: string
}

function fmt(v: string | number, business: BusinessCtx, locale: string) {
  return formatMoney(v, business.currency_code, business.currency_exponent, locale)
}

export function generatePoText({ order, items, business, locale }: DocInput): string {
  const lines: string[] = []
  lines.push(business.name.toUpperCase())
  lines.push(`Purchase Order #${order.po_number}`)
  lines.push('')
  lines.push(`Date: ${formatDateTime(order.ordered_at ?? order.created_at, business.timezone, locale)}`)
  lines.push(`Supplier: ${order.supplier_name}`)
  lines.push(`Location: ${order.location_name}`)
  lines.push(`Status: ${order.status.replace(/_/g, ' ')}`)
  if (order.note) {
    lines.push('')
    lines.push('Note:')
    lines.push(order.note)
  }
  lines.push('')
  lines.push('ITEMS')
  lines.push('-'.repeat(64))
  for (const item of items) {
    const lineTotal = new Decimal(item.qty_ordered_purchase).times(item.expected_unit_cost)
    lines.push(`${item.product_name}`)
    lines.push(
      `  ${new Decimal(item.qty_ordered_purchase).toString()} ${item.purchase_unit} × ${fmt(item.expected_unit_cost, business, locale)}/${item.purchase_unit} = ${fmt(lineTotal.toFixed(4), business, locale)}`,
    )
    lines.push(
      `  Pack: 1 ${item.purchase_unit} = ${new Decimal(item.conversion_to_base).toString()} base units`,
    )
  }
  lines.push('-'.repeat(64))
  lines.push(`ESTIMATED TOTAL: ${fmt(order.expected_total, business, locale)}`)
  lines.push('')
  lines.push('Actual cost is recorded on receipt.')
  return lines.join('\n')
}

/**
 * Renders the PO to a printable HTML page and triggers the browser's print
 * dialog with "Save as PDF" as the default output. This avoids a heavyweight
 * PDF library while still producing brand-consistent, downloadable documents.
 */
export async function downloadPoPdf(input: DocInput): Promise<void> {
  const html = renderPoHtml(input)
  const printWindow = window.open('', '_blank', 'width=800,height=1000')
  if (!printWindow) throw new Error('Could not open print window')
  printWindow.document.write(html)
  printWindow.document.close()
  // Wait for the document to render, then trigger print.
  await new Promise((r) => setTimeout(r, 250))
  printWindow.focus()
  printWindow.print()
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderPoHtml({ order, items, business, locale }: DocInput): string {
  const dateStr = formatDateTime(order.ordered_at ?? order.created_at, business.timezone, locale)
  const rows = items
    .map((item) => {
      const lineTotal = new Decimal(item.qty_ordered_purchase).times(item.expected_unit_cost)
      return `
        <tr>
          <td>
            <div class="pname">${esc(item.product_name)}</div>
            <div class="psub">1 ${esc(item.purchase_unit)} = ${new Decimal(item.conversion_to_base).toString()} base units</div>
          </td>
          <td class="num">${new Decimal(item.qty_ordered_purchase).toString()} ${esc(item.purchase_unit)}</td>
          <td class="num">${esc(fmt(item.expected_unit_cost, business, locale))}</td>
          <td class="num">${esc(fmt(lineTotal.toFixed(4), business, locale))}</td>
        </tr>`
    })
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>PO #${order.po_number} · ${esc(business.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }
  .subtitle { color: #64748b; font-size: 13px; margin-top: 4px; }
  .po-num { text-align: right; }
  .po-num-label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .po-num-value { font-size: 28px; font-weight: 800; color: #2563eb; letter-spacing: -0.02em; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .meta .item { padding: 12px 14px; background: #f8fafc; border-radius: 8px; }
  .meta .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta .value { color: #0f172a; font-weight: 600; margin-top: 3px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  thead th { background: #f1f5f9; padding: 10px 12px; text-align: left; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #64748b; font-weight: 600; }
  thead th.num { text-align: right; }
  tbody td { padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pname { font-weight: 600; color: #0f172a; }
  .psub { color: #94a3b8; font-size: 11px; margin-top: 2px; }
  .total-row { background: #0f172a; color: #fff; }
  .total-row td { padding: 14px 12px; font-weight: 700; font-size: 15px; border-bottom: none; }
  .total-row td.num { font-size: 18px; letter-spacing: -0.01em; }
  .note { background: #fefce8; border-left: 4px solid #eab308; padding: 12px 14px; margin-bottom: 20px; border-radius: 4px; font-size: 13px; color: #713f12; }
  .footer { color: #94a3b8; font-size: 11px; margin-top: 32px; text-align: center; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${esc(business.name)}</div>
      <div class="subtitle">Purchase Order</div>
    </div>
    <div class="po-num">
      <div class="po-num-label">PO Number</div>
      <div class="po-num-value">#${order.po_number}</div>
    </div>
  </div>

  <div class="meta">
    <div class="item"><div class="label">Supplier</div><div class="value">${esc(order.supplier_name)}</div></div>
    <div class="item"><div class="label">Location</div><div class="value">${esc(order.location_name)}</div></div>
    <div class="item"><div class="label">Date</div><div class="value">${esc(dateStr)}</div></div>
    <div class="item"><div class="label">Status</div><div class="value" style="text-transform: capitalize;">${esc(order.status.replace(/_/g, ' '))}</div></div>
  </div>

  ${order.note ? `<div class="note"><strong>Note:</strong> ${esc(order.note)}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Ordered</th>
        <th class="num">Unit cost</th>
        <th class="num">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="3">Estimated total</td>
        <td class="num">${esc(fmt(order.expected_total, business, locale))}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">Actual cost is recorded when goods are received.</div>
</body>
</html>`
}
