import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Info,
} from 'lucide-react'
import Decimal from 'decimal.js'
import {
  usePurchaseOrderDetail,
  useReceiveGoods,
  type PurchaseOrderItem,
} from '@/features/procurement/use-purchase-orders'
import { PoStatusBadge } from '@/features/procurement/po-status-badge'
import { useActiveBusiness } from '@/features/business/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { ErrorState, PermissionDeniedState } from '@/components/data/error-state'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { ReceiptDiscrepancy } from '@/types/database'

interface LineDraft {
  poItemId: string
  movementId: string
  qtyReceivedPurchase: string
  qtyGoodPurchase: string
  qtyDamagedBase: string
  qtyDiscrepancyBase: string
  reason: ReceiptDiscrepancy
  unitCostPurchase: string
  note: string
}

const REASON_LABELS: Record<ReceiptDiscrepancy, string> = {
  none: 'No issue',
  damaged: 'Damaged',
  wrong: 'Wrong item',
  expired: 'Expired',
  missing: 'Missing',
  other: 'Other',
}

import { useBarcodeResolver, unitsPerScan, resolvedLabel } from '@/features/scan/barcode-resolver'
import { useExclusiveScanSubscription } from '@/features/scan/scan-engine'
import { ScanStrip } from '@/features/scan/scan-strip'
import type { ScanFeedback } from '@/features/scan/use-scan-to-basket'
import { LabelSuggestionDialog, type LabelSuggestion } from '@/features/print/label-automation'

export function ReceiveGoodsPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { role } = useActiveBusiness()
  const canReceive = role === 'owner' || role === 'manager' || role === 'cashier'

  const { data, isLoading, isError, refetch } = usePurchaseOrderDetail(id)
  const receiveMutation = useReceiveGoods()

  const [receiptId] = useState(() => crypto.randomUUID())
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({})
  const [note, setNote] = useState('')
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null)
  const [labelPrompt, setLabelPrompt] = useState<LabelSuggestion[] | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const resolve = useBarcodeResolver()

  const openLines = useMemo(
    () => (data?.items ?? []).filter((i) => i.status !== 'complete'),
    [data?.items],
  )

  function ensureDraft(item: PurchaseOrderItem): LineDraft {
    const existing = drafts[item.id]
    if (existing) return existing
    const orderedBase = new Decimal(item.qty_ordered_purchase).times(item.conversion_to_base)
    const remainingBase = orderedBase.minus(item.qty_received_base)
    const remainingPurchase = new Decimal(item.conversion_to_base).gt(0)
      ? remainingBase.div(item.conversion_to_base)
      : new Decimal(0)
    const fresh: LineDraft = {
      poItemId: item.id,
      movementId: crypto.randomUUID(),
      qtyReceivedPurchase: remainingPurchase.gt(0) ? remainingPurchase.toString() : '',
      qtyGoodPurchase: remainingPurchase.gt(0) ? remainingPurchase.toString() : '',
      qtyDamagedBase: '',
      qtyDiscrepancyBase: '',
      reason: 'none',
      unitCostPurchase: item.expected_unit_cost || '',
      note: '',
    }
    setDrafts((prev) => ({ ...prev, [item.id]: fresh }))
    return fresh
  }

  function updateDraft(poItemId: string, patch: Partial<LineDraft>) {
    setDrafts((prev) => ({ ...prev, [poItemId]: { ...prev[poItemId], ...patch } }))
  }

  /**
   * Scanning at receiving — the second client of the Scan Engine.
   *
   * The resolver returns units in BASE terms; this screen works in PURCHASE
   * units. So a scan adds `units_per_scan / conversion_to_base` purchase units:
   * a carton code on a carton-ordered line adds exactly one carton, and a piece
   * code on that same line adds a twelfth of one. That division is the whole
   * reason the resolver carries unit context — receive_goods still divides cost
   * by the conversion afterwards, so the per-base cost invariant is untouched.
   */
  const handleScan = useCallback(
    async (code: string) => {
      const resolved = await resolve(code)
      if (!resolved.found) {
        setScanFeedback({ ok: false, label: code, detail: 'Not linked to any product' })
        return
      }
      const line = (data?.items ?? []).find(
        (i) => i.variant_id === resolved.variant_id && i.status !== 'complete',
      )
      if (!line) {
        setScanFeedback({
          ok: false,
          label: resolvedLabel(resolved),
          detail: 'Not an open line on this order',
        })
        return
      }

      const conversion = new Decimal(line.conversion_to_base)
      const addPurchase = conversion.gt(0)
        ? new Decimal(unitsPerScan(resolved)).div(conversion)
        : new Decimal(1)

      setDrafts((prev) => {
        const current = prev[line.id]
        const base: LineDraft = current ?? {
          poItemId: line.id,
          movementId: crypto.randomUUID(),
          qtyReceivedPurchase: '',
          qtyGoodPurchase: '',
          qtyDamagedBase: '',
          qtyDiscrepancyBase: '',
          reason: 'none',
          unitCostPurchase: line.expected_unit_cost || '',
          note: '',
        }
        // A scan counts what physically arrived, so it drives received AND good
        // together; damage is still recorded by hand on the line.
        const nextReceived = new Decimal(base.qtyReceivedPurchase || '0').plus(addPurchase)
        const nextGood = new Decimal(base.qtyGoodPurchase || '0').plus(addPurchase)
        return {
          ...prev,
          [line.id]: {
            ...base,
            qtyReceivedPurchase: nextReceived.toString(),
            qtyGoodPurchase: nextGood.toString(),
          },
        }
      })

      setScanFeedback({
        ok: true,
        label: resolvedLabel(resolved),
        detail: `+${addPurchase.toString()} ${line.purchase_unit}`,
      })
    },
    [resolve, data?.items],
  )

  useExclusiveScanSubscription((event) => void handleScan(event.code), canReceive)

  const linesToSubmit = useMemo(() => {
    return Object.values(drafts).filter((d) => {
      const rec = Number(d.qtyReceivedPurchase || '0')
      const good = Number(d.qtyGoodPurchase || '0')
      const damaged = Number(d.qtyDamagedBase || '0')
      const disc = Number(d.qtyDiscrepancyBase || '0')
      return rec > 0 || good > 0 || damaged > 0 || disc > 0
    })
  }, [drafts])

  const canSubmit = linesToSubmit.length > 0 && !receiveMutation.isPending

  async function submit() {
    if (!data || !canSubmit) return
    try {
      const receipt = await receiveMutation.mutateAsync({
        receiptId,
        poId: data.order.id,
        note: note.trim() || null,
        items: linesToSubmit.map((d) => ({
          po_item_id: d.poItemId,
          qty_received_purchase: d.qtyReceivedPurchase || '0',
          qty_good_purchase: d.qtyGoodPurchase || '0',
          qty_damaged_base: d.qtyDamagedBase || '0',
          qty_discrepancy_base: d.qtyDiscrepancyBase || '0',
          discrepancy_reason: d.reason,
          unit_cost_purchase: d.unitCostPurchase || '0',
          movement_id: d.movementId,
          note: d.note.trim() || null,
        })),
      })
      toast({
        title: 'Goods received',
        description: `Recorded ${linesToSubmit.length} line${linesToSubmit.length === 1 ? '' : 's'}`,
      })

      // Event-driven label automation: goods arriving is the one moment
      // printing labels is obviously worth doing, so ask now rather than
      // hoping someone remembers later. Always asks — never queues silently.
      const suggestions: LabelSuggestion[] = linesToSubmit
        .map((d): LabelSuggestion | null => {
          const line = (data.items ?? []).find((i) => i.id === d.poItemId)
          if (!line) return null
          const good = new Decimal(d.qtyGoodPurchase || d.qtyReceivedPurchase || '0')
          const baseUnits = good.times(line.conversion_to_base)
          if (baseUnits.lte(0)) return null
          return {
            productName: line.product_name,
            variantName: null,
            price: null,
            code: null,
            sku: null,
            quantity: Math.min(Math.round(baseUnits.toNumber()), 500),
          }
        })
        .filter((s): s is LabelSuggestion => s !== null)

      if (suggestions.length > 0) {
        setLabelPrompt(suggestions)
        setPendingNavigation(`/purchase-orders/${data.order.id}`)
        return
      }

      navigate(`/purchase-orders/${data.order.id}`, {
        replace: true,
        state: { receiptId: receipt.id },
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't record receipt",
        description: toReadableError(error),
      })
    }
  }

  if (!canReceive) return <PermissionDeniedState requiredRole="cashier" />

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !data) {
    return <ErrorState error={new Error('Purchase order not found')} onRetry={() => refetch()} />
  }

  const { order } = data

  if (order.status === 'completed' || order.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
          <ArrowLeft className="size-4" /> Back to PO
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <p className="text-lg font-medium text-text-primary">This PO is {order.status}</p>
            <p className="max-w-sm text-sm text-text-secondary">
              You can't receive against a {order.status} purchase order.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
          <ArrowLeft className="size-4" /> Back to PO
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Receive · PO #{order.po_number}
          </h1>
          <PoStatusBadge status={order.status} />
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">
          {order.supplier_name} · {openLines.length} open line{openLines.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Conversion primer */}
      <Card className="border-accent-primary/30 bg-accent-primary/5">
        <CardContent className="flex flex-wrap items-start gap-3 pt-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
            <Info className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">Cost is recorded per base unit</p>
            <p className="mt-0.5 text-sm text-text-secondary">
              Enter cost per <span className="font-medium">purchase unit</span> (e.g. per carton). The system divides
              by the conversion so stock is valued per base unit — a carton at{' '}
              <Money value="12000" /> with a pack of 12 records as <Money value="1000" />/pack.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scanning is the fast path here: check goods off the order by pointing
          a scanner at them instead of typing every line. */}
      {openLines.length > 0 && canReceive && (
        <ScanStrip feedback={scanFeedback} className="mb-4" />
      )}

      {labelPrompt && (
        <LabelSuggestionDialog
          title="Print labels for what arrived?"
          description="New stock usually needs a shelf or product label. Adjust the counts or skip — nothing prints until you send it to a device."
          suggestions={labelPrompt}
          onClose={() => {
            setLabelPrompt(null)
            if (pendingNavigation) navigate(pendingNavigation, { replace: true })
          }}
        />
      )}

      {openLines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <p className="text-lg font-medium text-text-primary">Nothing to receive</p>
            <p className="max-w-sm text-sm text-text-secondary">
              All lines on this PO are already complete.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {openLines.map((item) => {
            const draft = drafts[item.id] ?? {
              poItemId: item.id,
              movementId: crypto.randomUUID(),
              qtyReceivedPurchase: '',
              qtyGoodPurchase: '',
              qtyDamagedBase: '',
              qtyDiscrepancyBase: '',
              reason: 'none' as ReceiptDiscrepancy,
              unitCostPurchase: item.expected_unit_cost || '',
              note: '',
            }
            return (
              <ReceiveLine
                key={item.id}
                item={item}
                draft={draft}
                onFocus={() => ensureDraft(item)}
                onChange={(patch) => {
                  if (!drafts[item.id]) ensureDraft(item)
                  updateDraft(item.id, patch)
                }}
              />
            )
          })}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <label className="text-sm font-medium text-text-secondary">Receipt note (optional)</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Overall delivery notes, invoice reference, driver…"
            rows={2}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="text-sm text-text-secondary">
              {linesToSubmit.length > 0 ? (
                <>
                  Recording <span className="font-semibold text-text-primary">{linesToSubmit.length}</span> line
                  {linesToSubmit.length === 1 ? '' : 's'} in this receipt
                </>
              ) : (
                'Fill in what you actually received to enable submit.'
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/purchase-orders/${order.id}`)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit}>
                {receiveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                <PackageCheck className="size-4" /> Confirm receipt
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReceiveLine({
  item,
  draft,
  onFocus,
  onChange,
}: {
  item: PurchaseOrderItem
  draft: LineDraft
  onFocus: () => void
  onChange: (patch: Partial<LineDraft>) => void
}) {
  const orderedBase = new Decimal(item.qty_ordered_purchase).times(item.conversion_to_base)
  const remainingBase = orderedBase.minus(item.qty_received_base)
  const remainingPurchase = new Decimal(item.conversion_to_base).gt(0)
    ? remainingBase.div(item.conversion_to_base)
    : new Decimal(0)

  const good = new Decimal(draft.qtyGoodPurchase || '0')
  const rec = new Decimal(draft.qtyReceivedPurchase || '0')
  const conv = new Decimal(item.conversion_to_base)
  const cost = new Decimal(draft.unitCostPurchase || '0')
  const goodBase = good.times(conv)
  const perBaseCost = conv.gt(0) ? cost.div(conv) : new Decimal(0)
  const damaged = new Decimal(draft.qtyDamagedBase || '0')
  const disc = new Decimal(draft.qtyDiscrepancyBase || '0')
  const hasDiscrepancy = good.gt(0) && good.lt(rec)
  const overShipping = rec.gt(remainingPurchase)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{item.product_name}</CardTitle>
          <p className="mt-0.5 text-xs text-text-muted">
            Ordered <Quantity value={item.qty_ordered_purchase} /> {item.purchase_unit}
            {' · '}
            1 {item.purchase_unit} = {conv.toString()} base
            {' · '}
            <span className="font-medium text-warning">
              <Quantity value={remainingBase.toString()} /> remaining
            </span>
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-text-secondary">Received ({item.purchase_unit}s)</label>
            <Input
              value={draft.qtyReceivedPurchase}
              onFocus={onFocus}
              onChange={(e) => {
                const value = e.target.value
                onChange({
                  qtyReceivedPurchase: value,
                  qtyGoodPurchase: draft.qtyGoodPurchase || value,
                })
              }}
              inputMode="decimal"
              placeholder="0"
              className="mt-1"
            />
            {overShipping && (
              <p className="mt-1 text-xs text-warning">
                <AlertTriangle className="mr-1 inline size-3" />
                Over-shipment — exceeds remaining
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Good (usable)</label>
            <Input
              value={draft.qtyGoodPurchase}
              onFocus={onFocus}
              onChange={(e) => onChange({ qtyGoodPurchase: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Damaged ({item.purchase_unit === 'unit' ? 'base' : 'base units'})
            </label>
            <Input
              value={draft.qtyDamagedBase}
              onFocus={onFocus}
              onChange={(e) => onChange({ qtyDamagedBase: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Missing/other (base)</label>
            <Input
              value={draft.qtyDiscrepancyBase}
              onFocus={onFocus}
              onChange={(e) => onChange({ qtyDiscrepancyBase: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-text-secondary">
              Actual cost / {item.purchase_unit}
            </label>
            <Input
              value={draft.unitCostPurchase}
              onFocus={onFocus}
              onChange={(e) => onChange({ unitCostPurchase: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1"
            />
          </div>
          {(damaged.gt(0) || disc.gt(0) || hasDiscrepancy) && (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-text-secondary">Discrepancy reason</label>
              <Select value={draft.reason} onValueChange={(v) => onChange({ reason: v as ReceiptDiscrepancy })}>
                <SelectTrigger className="mt-1" aria-label="Discrepancy reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REASON_LABELS) as ReceiptDiscrepancy[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* THE conversion preview — the founder's core requirement made visible */}
        {(good.gt(0) || cost.gt(0)) && (
          <div className="rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {good.gt(0) && (
                <div>
                  <p className="text-xs text-text-muted">Into inventory</p>
                  <p className="text-sm">
                    <span className="font-medium">
                      <Quantity value={good.toString()} /> {item.purchase_unit}
                    </span>
                    <span className="text-text-muted"> × {conv.toString()} = </span>
                    <span className="font-semibold text-accent-primary">
                      <Quantity value={goodBase.toString()} /> base units
                    </span>
                  </p>
                </div>
              )}
              {cost.gt(0) && conv.gt(0) && (
                <div>
                  <p className="text-xs text-text-muted">Cost basis (ledger)</p>
                  <p className="text-sm">
                    <span className="font-medium">
                      <Money value={cost.toString()} />/{item.purchase_unit}
                    </span>
                    <span className="text-text-muted"> ÷ {conv.toString()} = </span>
                    <span className="font-semibold text-accent-primary">
                      <Money value={perBaseCost.toFixed(4)} />/base unit
                    </span>
                  </p>
                </div>
              )}
            </div>
            {(damaged.gt(0) || disc.gt(0)) && (
              <p className="mt-2 border-t border-accent-primary/20 pt-2 text-xs text-warning">
                <AlertTriangle className="mr-1 inline size-3" />
                Damaged/missing quantities are recorded but do not enter inventory.
              </p>
            )}
          </div>
        )}

        {(damaged.gt(0) || disc.gt(0)) && (
          <div>
            <label className="text-xs font-medium text-text-secondary">Line note (optional)</label>
            <Input
              value={draft.note}
              onFocus={onFocus}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder="Details for supplier follow-up…"
              className="mt-1"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
