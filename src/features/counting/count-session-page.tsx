import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  ScanLine,
  EyeOff,
  Eye,
  Camera,
  Search,
  Loader2,
  ShieldCheck,
  Ban,
  CheckCircle2,
  Printer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/data/error-state'
import {
  useCountSession,
  useCountItems,
  useRecordCount,
  useCancelCountSession,
  COUNT_MODE_LABELS,
  summariseVariance,
  type CountRow,
} from '@/features/counting/use-count-session'
import { CountApprovalDialog } from '@/features/counting/count-approval-dialog'
import { useBarcodeResolver, unitsPerScan } from '@/features/scan/barcode-resolver'
import { useExclusiveScanSubscription } from '@/features/scan/scan-engine'
import { CameraScannerDialog, isCameraScanSupported } from '@/features/scan/camera-scanner'
import { useEnqueuePrintJob } from '@/features/print/print-queue'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * The counting canvas.
 *
 * Scanning is the input method: each scan of a variant adds its units (a carton
 * code adds the whole carton, via units_per_scan). Typing `40*` before a scan
 * SETS forty instead of adding one — the standard warehouse convention, and the
 * only way counting a full shelf isn't forty scans.
 */
export function CountSessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: session, isLoading: sessionLoading, isError } = useCountSession(id)
  const { data: rows, isLoading: rowsLoading } = useCountItems(id)
  const recordCount = useRecordCount(id)
  const cancelSession = useCancelCountSession()
  const enqueue = useEnqueuePrintJob()
  const resolve = useBarcodeResolver()

  const [search, setSearch] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [lastScan, setLastScan] = useState<{ name: string; qty: string } | null>(null)
  /** `40*` then scan → set 40. Cleared after it is consumed. */
  const multiplierRef = useRef<string>('')
  const [multiplier, setMultiplier] = useState('')

  const isOpen = session?.status === 'open' || session?.status === 'counting'
  const blindHidden = !!session?.is_blind && !revealed && isOpen

  const summary = useMemo(() => summariseVariance(rows ?? []), [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows ?? []
    return (rows ?? []).filter(
      (r) =>
        r.productName.toLowerCase().includes(term) ||
        (r.variantName ?? '').toLowerCase().includes(term) ||
        (r.sku ?? '').toLowerCase().includes(term),
    )
  }, [rows, search])

  async function applyScan(code: string) {
    if (!isOpen) return
    const resolved = await resolve(code)
    if (!resolved.found) {
      toast({
        variant: 'destructive',
        title: 'Unknown barcode',
        description: `${code} isn't linked to any product yet.`,
      })
      return
    }
    const row = (rows ?? []).find((r) => r.variantId === resolved.variant_id)
    if (!row) {
      toast({
        variant: 'destructive',
        title: 'Not in this count',
        description: `${resolved.product_name} wasn't part of the snapshot for this session.`,
      })
      return
    }

    // A carton scan adds the whole carton. The resolver carries unit context so
    // the count never has to know what a carton is.
    const units = new Decimal(unitsPerScan(resolved))
    const override = multiplierRef.current
    const next = override
      ? new Decimal(override)
      : (row.counted ?? new Decimal(0)).plus(units)

    multiplierRef.current = ''
    setMultiplier('')
    setLastScan({ name: row.productName, qty: next.toString() })

    recordCount.mutate(
      { variantId: row.variantId, countedQty: next },
      {
        onError: (e) =>
          toast({
            variant: 'destructive',
            title: "Couldn't record that count",
            description: toReadableError(e),
          }),
      },
    )
  }

  useExclusiveScanSubscription((event) => void applyScan(event.code), !!isOpen)

  function setCounted(row: CountRow, value: string) {
    const trimmed = value.trim()
    if (trimmed === '') return
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) return
    recordCount.mutate({ variantId: row.variantId, countedQty: new Decimal(trimmed) })
  }

  async function printVarianceReport() {
    if (!rows || !session) return
    const counted = rows.filter((r) => r.counted !== null && r.variance && !r.variance.isZero())
    await enqueue.mutateAsync({
      jobType: 'variance_report',
      payload: {
        title: 'Stock count variance',
        subtitle: `${COUNT_MODE_LABELS[session.mode]} · ${counted.length} discrepanc${counted.length === 1 ? 'y' : 'ies'}`,
        columns: ['Product', 'Expected', 'Counted', 'Variance', 'Value'],
        rows: counted.map((r) => [
          r.variantName ? `${r.productName} · ${r.variantName}` : r.productName,
          r.expected.toString(),
          r.counted?.toString() ?? '',
          r.variance?.toString() ?? '',
          r.varianceValue?.toFixed(2) ?? '',
        ]),
        footNote: `Net ${summary.net.isNegative() ? 'shrinkage' : 'gain'}: ${summary.net.abs().toFixed(2)}`,
      },
    })
    toast({ title: 'Variance report queued', description: 'Print it from the print queue.' })
  }

  if (sessionLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !session) {
    return <ErrorState error={new Error('Count session not found')} onRetry={() => navigate('/inventory/counts')} />
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/inventory/counts')}>
        <ArrowLeft className="size-4" /> Stock counts
      </Button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-text-primary">
            {COUNT_MODE_LABELS[session.mode]}
            {session.is_blind && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                <EyeOff className="size-3" /> Blind
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {session.status === 'approved'
              ? 'Approved. Adjustments have been posted to the ledger.'
              : session.status === 'cancelled'
                ? 'Cancelled. Nothing was posted.'
                : 'Scan or type what you find. Nothing moves until a manager approves.'}
          </p>
        </div>

        {isOpen && (
          <div className="flex flex-wrap gap-2">
            {isCameraScanSupported() && (
              <Button variant="outline" onClick={() => setCameraOpen(true)}>
                <Camera className="size-4" /> Camera
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Cancel this count? Nothing will be posted.')) {
                  cancelSession.mutate(session.id, {
                    onSuccess: () => navigate('/inventory/counts'),
                  })
                }
              }}
            >
              <Ban className="size-4" /> Cancel
            </Button>
            <Button onClick={() => setApproveOpen(true)} disabled={summary.countedLines === 0}>
              <ShieldCheck className="size-4" /> Submit for approval
            </Button>
          </div>
        )}
        {session.status === 'approved' && (
          <Button variant="outline" onClick={printVarianceReport}>
            <Printer className="size-4" /> Variance report
          </Button>
        )}
      </div>

      {/* Scan feedback. A cashier looking at a shelf needs to know the scan
          landed without looking away from the shelf. */}
      {isOpen && (
        <Card className="mb-4 border-accent-primary/30">
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-6">
            <ScanLine className="size-5 text-accent-primary" />
            <div className="min-w-0 flex-1">
              {lastScan ? (
                <p className="text-sm text-text-primary">
                  <span className="font-medium">{lastScan.name}</span> — counted{' '}
                  <span className="font-semibold tabular-nums">{lastScan.qty}</span>
                </p>
              ) : (
                <p className="text-sm text-text-secondary">
                  Scan an item to count it. Type a number then <kbd className="rounded border border-border px-1">*</kbd>{' '}
                  before scanning to set that quantity instead of adding one.
                </p>
              )}
            </div>
            <Input
              value={multiplier}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, '')
                setMultiplier(v)
                multiplierRef.current = v
              }}
              placeholder="Set qty"
              inputMode="decimal"
              aria-label="Quantity for next scan"
              className="w-28"
            />
          </CardContent>
        </Card>
      )}

      {/* Summary. In blind mode the variance is deliberately withheld. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Lines" value={String(summary.total)} />
        <SummaryTile label="Counted" value={String(summary.countedLines)} />
        <SummaryTile label="Not counted" value={String(summary.uncounted)} />
        {blindHidden ? (
          <SummaryTile label="Variance" value="Hidden" muted />
        ) : (
          <SummaryTile
            label="Net variance"
            value={<Money value={summary.net} />}
            tone={summary.net.isNegative() ? 'bad' : summary.net.isZero() ? undefined : 'good'}
          />
        )}
      </div>

      {session.is_blind && isOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted/50 p-3">
          <EyeOff className="size-4 shrink-0 text-text-muted" />
          <p className="min-w-0 flex-1 text-sm text-text-secondary">
            Expected quantities are hidden so the count reflects the shelf, not the screen.
          </p>
          <Button variant="outline" size="sm" onClick={() => setRevealed((v) => !v)}>
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {revealed ? 'Hide expected' : 'Reveal expected'}
          </Button>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find an item by name or SKU"
          className="pl-9"
          aria-label="Search count lines"
        />
      </div>

      {rowsLoading && <Skeleton className="h-64 w-full rounded-xl" />}

      {!rowsLoading && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5 font-semibold">Item</th>
                <th className="px-4 py-2.5 text-right font-semibold">
                  {blindHidden ? '—' : 'Expected'}
                </th>
                <th className="px-4 py-2.5 text-right font-semibold">Counted</th>
                <th className="px-4 py-2.5 text-right font-semibold">
                  {blindHidden ? '—' : 'Variance'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.variantId}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-text-primary">{row.productName}</p>
                    <p className="text-xs text-text-muted">
                      {row.variantName ?? row.sku ?? row.baseUnit}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                    {blindHidden ? (
                      <span className="text-text-muted">hidden</span>
                    ) : (
                      <Quantity value={row.expected} unit={row.baseUnit} />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isOpen ? (
                      <Input
                        defaultValue={row.counted?.toString() ?? ''}
                        key={row.counted?.toString() ?? 'empty'}
                        onBlur={(e) => setCounted(row, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        inputMode="decimal"
                        placeholder="—"
                        aria-label={`Counted quantity for ${row.productName}`}
                        className="ml-auto h-9 w-24 text-right"
                      />
                    ) : (
                      <span className="tabular-nums text-text-primary">
                        {row.counted ? <Quantity value={row.counted} unit={row.baseUnit} /> : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {blindHidden || !row.variance ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <span
                        className={cn(
                          'font-medium',
                          row.variance.isZero()
                            ? 'text-text-muted'
                            : row.variance.isNegative()
                              ? 'text-danger'
                              : 'text-success',
                        )}
                      >
                        {row.variance.isPositive() ? '+' : ''}
                        {row.variance.toString()}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-secondary">
                    {search ? 'No item matches that search.' : 'This session has no lines.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {session.status === 'approved' && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-sm text-text-secondary">
            Adjustments were posted through the stock ledger at snapshot cost, and any net shortage
            was written off as a Stock Shrinkage expense.
          </p>
        </div>
      )}

      {recordCount.isPending && (
        <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="size-3 animate-spin" /> Saving count
        </p>
      )}

      {cameraOpen && <CameraScannerDialog onClose={() => setCameraOpen(false)} />}
      {approveOpen && (
        <CountApprovalDialog
          session={session}
          summary={summary}
          onClose={() => setApproveOpen(false)}
          onApproved={() => setRevealed(true)}
        />
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
  muted,
}: {
  label: string
  value: React.ReactNode
  tone?: 'good' | 'bad'
  muted?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          muted ? 'text-text-muted' : tone === 'bad' ? 'text-danger' : tone === 'good' ? 'text-success' : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}
