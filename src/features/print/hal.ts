import type { PrintJobType } from '@/types/database'

/**
 * The Hardware Abstraction Layer.
 *
 * One interface, many devices. Browser printing is the FIRST adapter, not the
 * only shape — the interface exists now precisely so that when a real thermal
 * printer arrives, it drops in behind this and no calling screen changes.
 *
 * The rule that makes it worth having: no screen calls window.print(). Ever.
 * Once three call sites hardcode it, the abstraction can't be retrofitted
 * without touching all three, and that is the debt this phase exists to avoid.
 */

/** Physical target. Receipt widths are the two the thermal world actually uses. */
export type PrintMedium = 'receipt-80mm' | 'receipt-58mm' | 'label-50x25' | 'label-40x30' | 'a4'

export interface RenderedDocument {
  /** Self-contained HTML — no external assets, so any adapter can take it. */
  html: string
  medium: PrintMedium
  title: string
}

export interface PrintJobDescriptor {
  id: string
  jobType: PrintJobType
  copies: number
  document: RenderedDocument
}

export interface PrintAdapter {
  id: string
  label: string
  /** Whether this adapter can run in the current environment, right now. */
  isAvailable: () => boolean | Promise<boolean>
  print: (job: PrintJobDescriptor) => Promise<void>
}

/**
 * Browser adapter — the one that actually works today.
 *
 * Renders into a hidden same-origin iframe rather than a popup: popups get
 * blocked, and window.open() loses the print dialog on mobile Safari. The
 * iframe is removed after the dialog closes.
 */
export const browserPrintAdapter: PrintAdapter = {
  id: 'browser',
  label: 'Browser / system printer',
  isAvailable: () => typeof window !== 'undefined' && typeof window.print === 'function',
  print: (job) =>
    new Promise<void>((resolve, reject) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.position = 'fixed'
      frame.style.right = '0'
      frame.style.bottom = '0'
      frame.style.width = '0'
      frame.style.height = '0'
      frame.style.border = '0'
      document.body.appendChild(frame)

      const cleanup = () => {
        // Deferred: removing during the print dialog cancels it in Chrome.
        setTimeout(() => frame.remove(), 1000)
      }

      frame.onload = () => {
        try {
          const win = frame.contentWindow
          if (!win) throw new Error('Print frame unavailable')
          win.focus()
          win.print()
          cleanup()
          resolve()
        } catch (error) {
          cleanup()
          reject(error)
        }
      }

      const doc = frame.contentDocument
      if (!doc) {
        frame.remove()
        reject(new Error('Print frame unavailable'))
        return
      }
      doc.open()
      doc.write(job.document.html)
      doc.close()
    }),
}

/**
 * Everything below is a declared seam, not a promise. Each one throws rather
 * than silently doing nothing, so a half-wired adapter fails loudly in
 * development instead of swallowing a receipt in production.
 */
function stub(id: string, label: string, note: string): PrintAdapter {
  return {
    id,
    label,
    isAvailable: () => false,
    print: async () => {
      throw new Error(`${label} is not implemented yet. ${note}`)
    },
  }
}

export const escposAdapter = stub(
  'escpos',
  'ESC/POS thermal',
  'Needs the raw ESC/POS command encoder plus a transport (USB or network).',
)
export const webUsbAdapter = stub(
  'webusb',
  'USB printer (WebUSB)',
  'Needs navigator.usb device selection and an ESC/POS byte stream.',
)
export const webSerialAdapter = stub(
  'webserial',
  'Serial printer (Web Serial)',
  'Needs navigator.serial port selection and an ESC/POS byte stream.',
)
export const bluetoothAdapter = stub(
  'bluetooth',
  'Bluetooth printer',
  'Needs Web Bluetooth GATT characteristics for the printer service.',
)
export const zplAdapter = stub(
  'zpl',
  'ZPL label printer',
  'Needs a ZPL renderer for label media instead of HTML.',
)
export const tauriAdapter = stub(
  'tauri',
  'Desktop (Tauri)',
  'Needs the Tauri shell command bridge to the OS print spooler.',
)

export const PRINT_ADAPTERS: PrintAdapter[] = [
  browserPrintAdapter,
  escposAdapter,
  webUsbAdapter,
  webSerialAdapter,
  bluetoothAdapter,
  zplAdapter,
  tauriAdapter,
]

const ADAPTER_KEY = 'bp-print-adapter'

export function getSelectedAdapter(): PrintAdapter {
  const id = localStorage.getItem(ADAPTER_KEY)
  const found = PRINT_ADAPTERS.find((a) => a.id === id)
  // An unavailable stored adapter must never strand a receipt.
  return found ?? browserPrintAdapter
}

export function setSelectedAdapter(id: string) {
  localStorage.setItem(ADAPTER_KEY, id)
}
