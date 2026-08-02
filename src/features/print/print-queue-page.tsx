import { useState } from 'react'
import {
  Printer,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ScanLine,
  Usb,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { TableSkeleton } from '@/components/data/loading-state'
import {
  usePrintQueue,
  usePrintEngine,
  useUpdatePrintJob,
  renderJob,
  type PrintJob,
} from '@/features/print/print-queue'
import {
  PRINT_ADAPTERS,
  getSelectedAdapter,
  setSelectedAdapter,
  browserPrintAdapter,
} from '@/features/print/hal'
import { useScanEngineStore, emitManualScan } from '@/features/scan/scan-engine'
import { isCameraScanSupported } from '@/features/scan/camera-scanner'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/auth/use-locale'
import { useActiveBusiness } from '@/features/business/hooks'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { PrintJobType } from '@/types/database'

const JOB_LABELS: Record<PrintJobType, string> = {
  receipt: 'Receipt',
  product_label: 'Product labels',
  shelf_label: 'Shelf labels',
  warehouse_label: 'Warehouse labels',
  variance_report: 'Variance report',
  count_report: 'Count report',
  po_document: 'Purchase order',
  other: 'Document',
}

export function PrintQueuePage() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: jobs, isLoading, refetch } = usePrintQueue()
  const engine = usePrintEngine()
  const update = useUpdatePrintJob()

  const [adapterId, setAdapterId] = useState(() => getSelectedAdapter().id)
  const [draining, setDraining] = useState<string | null>(null)

  async function print(job: PrintJob) {
    setDraining(job.id)
    try {
      await engine.mutateAsync(job)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't print",
        description: toReadableError(error),
      })
    } finally {
      setDraining(null)
    }
  }

  async function printAll() {
    for (const job of (jobs ?? []).filter((j) => j.status === 'queued')) {
      await print(job)
    }
  }

  const queued = (jobs ?? []).filter((j) => j.status === 'queued')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Printing"
        description="Every receipt, label, and report becomes a job here first, then goes to a device. Nothing prints straight from a button."
        actions={
          <Button onClick={printAll} disabled={queued.length === 0 || !!draining}>
            <Printer className="size-4" /> Print all ({queued.length})
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Output device</CardTitle>
          <CardDescription>
            Browser printing works today. The others are declared connections that a thermal or
            label printer will plug into — they are listed so you can see what's coming, not
            because they work yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={adapterId}
            onValueChange={(v) => {
              setAdapterId(v)
              setSelectedAdapter(v)
            }}
          >
            <SelectTrigger className="max-w-sm" aria-label="Print device">
              <SelectValue>
                {PRINT_ADAPTERS.find((a) => a.id === adapterId)?.label ?? browserPrintAdapter.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRINT_ADAPTERS.map((adapter) => (
                <SelectItem key={adapter.id} value={adapter.id}>
                  {adapter.label}
                  {adapter.id !== 'browser' && ' — not available yet'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {adapterId !== 'browser' && (
            <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-sm text-text-secondary">
                That device isn't implemented yet, so printing will fail with a clear message rather
                than silently doing nothing. Switch back to the browser printer to actually print.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>Jobs waiting for a device, oldest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <TableSkeleton rows={3} columns={3} />}
          {!isLoading && (jobs ?? []).length === 0 && (
            <EmptyState
              icon={Printer}
              title="Nothing waiting"
              description="Receipts, labels, and reports queue here as you create them."
            />
          )}
          {!isLoading && (jobs ?? []).length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(jobs ?? []).map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      job.status === 'failed'
                        ? 'bg-danger/10 text-danger'
                        : job.status === 'done'
                          ? 'bg-success/10 text-success'
                          : 'bg-surface-muted text-text-muted',
                    )}
                  >
                    {job.status === 'failed' ? (
                      <AlertTriangle className="size-4" />
                    ) : job.status === 'done' ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {JOB_LABELS[job.job_type]}
                      {job.copies > 1 && ` × ${job.copies}`}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {renderJob(job).title}
                      {business && ` · ${formatDateTime(job.created_at, business.timezone, locale)}`}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => print(job)} disabled={draining === job.id}>
                    {draining === job.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Printer className="size-3.5" />
                    )}
                    {job.status === 'failed' ? 'Retry' : 'Print'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel job"
                    onClick={() => update.mutate({ id: job.id, status: 'cancelled' })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </CardContent>
      </Card>

      <ScannerDiagnostics />
    </div>
  )
}

/**
 * Hardware diagnostics. When a scanner "doesn't work", the question is always
 * whether the app is seeing keystrokes at all — this answers it in one look
 * without anyone opening a console.
 */
function ScannerDiagnostics() {
  const enabled = useScanEngineStore((s) => s.enabled)
  const setEnabled = useScanEngineStore((s) => s.setEnabled)
  const last = useScanEngineStore((s) => s.last)
  const [manual, setManual] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scanner</CardTitle>
        <CardDescription>
          A USB barcode scanner needs no setup — it behaves like a very fast keyboard, and the app
          tells the difference by typing speed. Scan anything here to check it's being seen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-lg',
              enabled ? 'bg-success/10 text-success' : 'bg-surface-muted text-text-muted',
            )}
          >
            <ScanLine className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">
              {enabled ? 'Listening for scans' : 'Scanning is off'}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {last
                ? `Last: ${last.code} (${last.source})`
                : 'Nothing scanned yet on this device.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEnabled(!enabled)}>
            {enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manual.trim()) {
                emitManualScan(manual)
                setManual('')
              }
            }}
            placeholder="Or type a code and press Enter"
            className="max-w-xs"
            aria-label="Test a code by hand"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-muted/50 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <p className="text-sm text-text-secondary">
            Camera scanning is{' '}
            <span className="font-medium text-text-primary">
              {isCameraScanSupported() ? 'available' : 'not available'}
            </span>{' '}
            on this browser.{' '}
            {isCameraScanSupported()
              ? 'Use it on a phone or tablet where there is no USB port.'
              : 'It needs Chrome or Edge — a USB scanner works everywhere.'}
          </p>
        </div>

        <div className="flex items-start gap-2.5 text-xs text-text-muted">
          <Usb className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Typing into a search box still works normally while scanning is on — only bursts faster
            than human typing are treated as a scan.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
