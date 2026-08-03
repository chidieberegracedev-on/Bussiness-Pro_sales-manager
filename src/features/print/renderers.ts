import { code128Svg } from '@/features/print/code128'
import type { PrintMedium, RenderedDocument } from '@/features/print/hal'

/**
 * Job payloads → self-contained HTML.
 *
 * Everything is inline: no stylesheet links, no fonts, no images by URL. An
 * adapter may hand this to an iframe today and to a Tauri spooler tomorrow,
 * and neither can be relied on to resolve an external asset.
 */

export interface ReceiptPayload {
  businessName: string
  receiptNumber: string
  occurredAt: string
  operator?: string | null
  terminal?: string | null
  shiftRef?: string | null
  lines: { name: string; qty: string; amount: string }[]
  subtotal: string
  discount?: string | null
  total: string
  payments: { method: string; amount: string }[]
  changeDue?: string | null
  /** Rendered as a QR so a customer can verify the sale or start a return. */
  verifyUrl?: string | null
  qrSvg?: string | null
  footer?: string | null
}

export interface LabelPayload {
  productName: string
  variantName?: string | null
  price?: string | null
  /** What the scanner should read back. */
  code?: string | null
  sku?: string | null
  extra?: string | null
}

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#000;background:#fff}
@page{margin:0}
`

function receiptCss(medium: PrintMedium): string {
  const width = medium === 'receipt-58mm' ? '58mm' : '80mm'
  const pad = medium === 'receipt-58mm' ? '2mm' : '3mm'
  return `
${BASE_CSS}
@page{size:${width} auto}
body{width:${width};padding:${pad};font-size:${medium === 'receipt-58mm' ? '10px' : '11px'};line-height:1.35}
h1{font-size:${medium === 'receipt-58mm' ? '13px' : '15px'};margin:0 0 2px;text-align:center}
.meta{text-align:center;color:#333;font-size:9px;margin-bottom:6px}
.rule{border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
td{padding:1px 0;vertical-align:top}
.qty{width:14%}
.amt{width:30%;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tot td{font-weight:700;font-size:${medium === 'receipt-58mm' ? '11px' : '13px'};padding-top:3px}
.pay td{color:#222}
.center{text-align:center}
.qr{margin:6px auto 2px;width:${medium === 'receipt-58mm' ? '26mm' : '30mm'}}
.qr svg{width:100%;height:auto;display:block}
.small{font-size:8.5px;color:#333}
`
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The receipt is an assembly of accountability the ledgers already record:
 * who served (Phase 8/9 operator), on which till, in which shift, paid how
 * (Phase 7 split payments). It displays that — it does not compute it.
 */
export function renderReceipt(
  payload: ReceiptPayload,
  medium: PrintMedium = 'receipt-80mm',
): RenderedDocument {
  // A job row is stored data — it may predate a payload change, or come from
  // a version of the app that wrote a different shape. Renderers therefore
  // treat every field as optional. They used to assume the shape and throw,
  // and because renderJob() is called during render, one malformed row took
  // the whole screen down.
  const lines = (payload.lines ?? [])
    .map(
      (l) =>
        `<tr><td class="qty">${esc(l.qty)}×</td><td>${esc(l.name)}</td><td class="amt">${esc(l.amount)}</td></tr>`,
    )
    .join('')

  const payments = (payload.payments ?? [])
    .map(
      (p) =>
        `<tr class="pay"><td colspan="2">${esc(p.method)}</td><td class="amt">${esc(p.amount)}</td></tr>`,
    )
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(payload.receiptNumber)}</title><style>${receiptCss(medium)}</style></head><body>
<h1>${esc(payload.businessName ?? '')}</h1>
<div class="meta">
  ${esc(payload.receiptNumber ?? '')}<br/>${esc(payload.occurredAt ?? '')}
  ${payload.operator ? `<br/>Served by ${esc(payload.operator)}` : ''}
  ${payload.terminal ? ` · ${esc(payload.terminal)}` : ''}
  ${payload.shiftRef ? `<br/>Shift ${esc(payload.shiftRef)}` : ''}
</div>
<div class="rule"></div>
<table>${lines}</table>
<div class="rule"></div>
<table>
  <tr><td colspan="2">Subtotal</td><td class="amt">${esc(payload.subtotal)}</td></tr>
  ${payload.discount ? `<tr><td colspan="2">Discount</td><td class="amt">-${esc(payload.discount)}</td></tr>` : ''}
  <tr class="tot"><td colspan="2">Total</td><td class="amt">${esc(payload.total)}</td></tr>
</table>
<div class="rule"></div>
<table>${payments}${
    payload.changeDue
      ? `<tr class="pay"><td colspan="2">Change</td><td class="amt">${esc(payload.changeDue)}</td></tr>`
      : ''
  }</table>
${payload.qrSvg ? `<div class="qr">${payload.qrSvg}</div><div class="center small">Scan to verify this receipt</div>` : ''}
${payload.footer ? `<div class="center small" style="margin-top:6px">${esc(payload.footer)}</div>` : ''}
</body></html>`

  return { html, medium, title: payload.receiptNumber ?? 'Receipt' }
}

/**
 * A label whose barcode doesn't scan is a sticker. The code is encoded as real
 * Code 128; if it can't be (non-ASCII), the digits print alone rather than a
 * barcode that would scan as something else.
 */
export function renderLabels(
  labels: LabelPayload[] | undefined,
  medium: PrintMedium = 'label-50x25',
): RenderedDocument {
  const size = medium === 'label-40x30' ? { w: 40, h: 30 } : { w: 50, h: 25 }

  const cells = (labels ?? [])
    .map((label) => {
      const svg = label.code ? code128Svg(label.code, { width: 150, height: 28 }) : null
      return `<div class="label">
  <div class="name">${esc(label.productName)}${label.variantName ? ` · ${esc(label.variantName)}` : ''}</div>
  ${label.price ? `<div class="price">${esc(label.price)}</div>` : ''}
  ${svg ? `<div class="bc">${svg}</div>` : label.code ? `<div class="code">${esc(label.code)}</div>` : ''}
  ${label.sku && !svg ? `<div class="code">${esc(label.sku)}</div>` : ''}
  ${label.extra ? `<div class="extra">${esc(label.extra)}</div>` : ''}
</div>`
    })
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
${BASE_CSS}
@page{size:${size.w}mm ${size.h}mm;margin:0}
body{width:${size.w}mm}
.label{width:${size.w}mm;height:${size.h}mm;padding:1.5mm;page-break-after:always;break-after:page;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.label:last-child{page-break-after:auto;break-after:auto}
.name{font-size:7.5px;font-weight:600;line-height:1.15;max-height:2.6em;overflow:hidden}
.price{font-size:11px;font-weight:700}
.bc{margin-top:auto}
.bc svg{width:100%;height:auto;display:block}
.code{font-family:monospace;font-size:7px;text-align:center}
.extra{font-size:6.5px;color:#333}
</style></head><body>${cells}</body></html>`

  const count = (labels ?? []).length
  return { html, medium, title: `${count} label${count === 1 ? '' : 's'}` }
}

export interface ReportPayload {
  title: string
  subtitle?: string | null
  columns: string[]
  rows: string[][]
  footNote?: string | null
}

/** Variance and count reports — A4, because these get filed, not stuck on a shelf. */
export function renderReport(payload: ReportPayload): RenderedDocument {
  const head = (payload.columns ?? []).map((c) => `<th>${esc(c)}</th>`).join('')
  const body = (payload.rows ?? [])
    .map((r) => `<tr>${(r ?? []).map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(payload.title ?? 'Document')}</title><style>
${BASE_CSS}
@page{size:A4;margin:14mm}
body{font-size:11px}
h1{font-size:16px;margin:0 0 2px}
.sub{color:#444;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left}
th{background:#f2f0ec;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
th:not(:first-child){text-align:right}
.foot{margin-top:10px;color:#444;font-size:10px}
</style></head><body>
<h1>${esc(payload.title ?? 'Document')}</h1>
${payload.subtitle ? `<div class="sub">${esc(payload.subtitle)}</div>` : ''}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${payload.footNote ? `<div class="foot">${esc(payload.footNote)}</div>` : ''}
</body></html>`

  return { html, medium: 'a4', title: payload.title ?? 'Document' }
}
