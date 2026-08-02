import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
  Info,
} from 'lucide-react'
import Decimal from 'decimal.js'
import { useSuppliers, useSupplier } from '@/features/procurement/use-suppliers'
import {
  useCreatePurchaseOrder,
  useSupplierLinksMap,
  useVariantPurchaseDefaults,
} from '@/features/procurement/use-purchase-orders'
import { useVariantsForPicker, type VariantOption } from '@/features/procurement/use-variants'
import { useActiveBusiness } from '@/features/business/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { EmptyState } from '@/components/data/empty-state'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface DraftLine {
  key: string // stable client key
  variant_id: string
  product_name: string
  variant_name: string | null
  base_unit: string
  purchase_unit: string
  conversion_to_base: string
  qty_ordered_purchase: string
  expected_unit_cost: string
}

function newPoId() {
  return crypto.randomUUID()
}

export function CreatePurchaseOrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { role } = useActiveBusiness()
  const canCreate = role === 'owner' || role === 'manager'

  const [poId] = useState(() => newPoId())
  const [supplierId, setSupplierId] = useState<string>(searchParams.get('supplier') ?? '')
  const [status, setStatus] = useState<'draft' | 'ordered'>('draft')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers(false)
  const { data: supplier } = useSupplier(supplierId || undefined)
  const { data: linksMap } = useSupplierLinksMap(supplierId || undefined)
  const fetchVariantDefaults = useVariantPurchaseDefaults()
  const createPo = useCreatePurchaseOrder()

  // Whenever the supplier changes, refresh lines' conversion from the supplier's link.
  useEffect(() => {
    if (!linksMap) return
    setLines((prev) =>
      prev.map((line) => {
        const link = linksMap.get(line.variant_id)
        if (!link) return line
        return {
          ...line,
          purchase_unit: link.purchase_unit,
          conversion_to_base: String(link.conversion_to_base),
          expected_unit_cost: line.expected_unit_cost || link.last_purchase_cost || '',
        }
      }),
    )
  }, [linksMap])

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = new Decimal(line.qty_ordered_purchase || '0')
      const cost = new Decimal(line.expected_unit_cost || '0')
      return sum.plus(qty.times(cost))
    }, new Decimal(0))
  }, [lines])

  const canSubmit = supplierId && lines.length > 0 && lines.every(
    (l) => Number(l.qty_ordered_purchase) > 0 && Number(l.conversion_to_base) > 0,
  )

  async function addVariants(variants: VariantOption[]) {
    const existing = new Set(lines.map((l) => l.variant_id))
    const newVariants = variants.filter((v) => !existing.has(v.variant_id))
    if (newVariants.length === 0) return
    const defaults = supplierId
      ? new Map<string, { unit: string; conversion: string }>()
      : await fetchVariantDefaults(newVariants.map((v) => v.variant_id))
    const additions: DraftLine[] = newVariants.map((v) => {
      const link = linksMap?.get(v.variant_id)
      const def = defaults.get(v.variant_id)
      return {
        key: crypto.randomUUID(),
        variant_id: v.variant_id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        base_unit: v.base_unit,
        purchase_unit: link?.purchase_unit ?? def?.unit ?? v.base_unit,
        conversion_to_base: String(link?.conversion_to_base ?? def?.conversion ?? '1'),
        qty_ordered_purchase: '1',
        expected_unit_cost: link?.last_purchase_cost ?? '',
      }
    })
    setLines((prev) => [...prev, ...additions])
    setPickerOpen(false)
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function submit() {
    if (!canSubmit) return
    try {
      const created = await createPo.mutateAsync({
        poId,
        supplierId,
        status,
        note: note.trim() || null,
        items: lines.map((l) => ({
          variant_id: l.variant_id,
          qty_ordered_purchase: l.qty_ordered_purchase,
          expected_unit_cost: l.expected_unit_cost || '0',
        })),
      })
      toast({
        title: status === 'ordered' ? 'Purchase order placed' : 'Draft saved',
        description: `PO #${created.po_number}`,
      })
      navigate(`/purchase-orders/${created.id}`, { replace: true })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't create PO",
        description: toReadableError(error),
      })
    }
  }

  if (!canCreate) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="You don't have access to this"
        description="Only owners and managers can create purchase orders."
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-orders')}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">New purchase order</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Creating the PO doesn't change any stock — that happens when you receive the goods.
        </p>
      </div>

      {/* Supplier + status */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Supplier</label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={suppliersLoading}>
                <SelectTrigger className="mt-1" aria-label="Supplier">
                  {/* Resolved name as children — a supplierId prefilled from
                      ?supplier= is set before the suppliers list loads, and
                      Radix won't re-resolve the label once the items mount
                      (same defect as Fix 009 §Issue 1). */}
                  <SelectValue placeholder="Choose a supplier…">
                    {suppliers?.find((s) => s.id === supplierId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplier && lines.length > 0 && !linksMap?.size && (
                <p className="mt-1 text-xs text-text-muted">
                  <Info className="mr-1 inline size-3" />
                  No linked products yet — using product-level fallback pack sizes.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Save as</label>
              <div className="mt-1 flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
                {(['draft', 'ordered'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all capitalize',
                      status === s
                        ? 'bg-card text-text-primary'
                        : 'text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {status === 'draft'
                  ? 'Save without notifying anyone. You can place it later.'
                  : 'Mark as placed with the supplier. Ready to receive.'}
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary">Note (optional)</label>
            <Textarea
              className="mt-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Delivery notes, PO reference, terms…"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Items ({lines.length})</CardTitle>
          <Button size="sm" onClick={() => setPickerOpen(true)} disabled={!supplierId}>
            <Plus className="size-4" /> Add item
          </Button>
        </CardHeader>
        <CardContent>
          {!supplierId ? (
            <EmptyState
              icon={ShoppingBag}
              title="Choose a supplier first"
              description="Pick who you're ordering from — items will use that supplier's pack sizes automatically."
            />
          ) : lines.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="No items yet"
              description="Add products you want to order from this supplier."
              action={
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus className="size-4" /> Add item
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {lines.map((line) => (
                <PoLineRow
                  key={line.key}
                  line={line}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => removeLine(line.key)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer / total */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <p className="text-sm text-text-secondary">Estimated total</p>
            <p className="text-2xl font-bold text-text-primary">
              <Money value={total.toFixed(4)} />
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              Actual cost is recorded when you receive.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/purchase-orders')}>
              <X className="size-4" /> Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit || createPo.isPending}>
              {createPo.isPending && <Loader2 className="size-4 animate-spin" />}
              {status === 'ordered' ? 'Place order' : 'Save draft'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {pickerOpen && (
        <VariantPickerDialog
          existing={new Set(lines.map((l) => l.variant_id))}
          onSelect={addVariants}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function PoLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: DraftLine
  onChange: (patch: Partial<DraftLine>) => void
  onRemove: () => void
}) {
  const qty = new Decimal(line.qty_ordered_purchase || '0')
  const conv = new Decimal(line.conversion_to_base || '0')
  const cost = new Decimal(line.expected_unit_cost || '0')
  const baseQty = qty.times(conv)
  const lineTotal = qty.times(cost)
  const perBaseCost = conv.gt(0) ? cost.div(conv) : new Decimal(0)

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">{line.product_name}</p>
          {line.variant_name && <p className="text-xs text-text-muted">{line.variant_name}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove item">
          <Trash2 className="size-4 text-danger" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-xs font-medium text-text-secondary">Qty</label>
          <Input
            value={line.qty_ordered_purchase}
            onChange={(e) => onChange({ qty_ordered_purchase: e.target.value })}
            inputMode="decimal"
            className="mt-1"
          />
          <p className="mt-0.5 text-xs text-text-muted">{line.purchase_unit}s</p>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary">Purchase unit</label>
          <Input
            value={line.purchase_unit}
            onChange={(e) => onChange({ purchase_unit: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary">Conversion</label>
          <Input
            value={line.conversion_to_base}
            onChange={(e) => onChange({ conversion_to_base: e.target.value })}
            inputMode="decimal"
            className="mt-1"
          />
          <p className="mt-0.5 text-xs text-text-muted">{line.base_unit}s per {line.purchase_unit || 'unit'}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary">Cost per {line.purchase_unit || 'unit'}</label>
          <Input
            value={line.expected_unit_cost}
            onChange={(e) => onChange({ expected_unit_cost: e.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1"
          />
        </div>
      </div>

      {/* Live conversion preview */}
      {qty.gt(0) && conv.gt(0) && (
        <div className="mt-3 rounded-md bg-accent-primary/5 px-3 py-2 text-sm text-text-secondary">
          <span className="font-medium text-text-primary">
            <Quantity value={qty.toString()} /> {line.purchase_unit}
          </span>{' '}
          × <Quantity value={conv.toString()} /> ={' '}
          <span className="font-semibold text-accent-primary">
            <Quantity value={baseQty.toString()} /> {line.base_unit}
          </span>
          {cost.gt(0) && (
            <>
              {' · '}
              <Money value={cost.toString()} />/{line.purchase_unit} ÷ {conv.toString()} ={' '}
              <span className="font-semibold text-accent-primary">
                <Money value={perBaseCost.toFixed(4)} />/{line.base_unit}
              </span>
              {' · line total '}
              <span className="font-semibold text-text-primary">
                <Money value={lineTotal.toFixed(4)} />
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function VariantPickerDialog({
  existing,
  onSelect,
  onClose,
}: {
  existing: Set<string>
  onSelect: (variants: VariantOption[]) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 200)
  const { data: variants, isLoading } = useVariantsForPicker(debounced)
  const [picked, setPicked] = useState<Record<string, VariantOption>>({})

  const pickedList = Object.values(picked)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add items</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-text-muted">Loading…</div>
            ) : !variants || variants.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">No products match.</div>
            ) : (
              <ul className="divide-y divide-border">
                {variants.map((v) => {
                  const isPicked = !!picked[v.variant_id]
                  const alreadyOnPo = existing.has(v.variant_id)
                  return (
                    <li key={v.variant_id}>
                      <button
                        type="button"
                        disabled={alreadyOnPo}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          alreadyOnPo && 'cursor-not-allowed opacity-50',
                          !alreadyOnPo && 'hover:bg-surface-muted',
                          isPicked && 'bg-accent-primary/5',
                        )}
                        onClick={() => {
                          if (alreadyOnPo) return
                          setPicked((p) => {
                            const next = { ...p }
                            if (next[v.variant_id]) delete next[v.variant_id]
                            else next[v.variant_id] = v
                            return next
                          })
                        }}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={isPicked || alreadyOnPo}
                          className="size-4 rounded border-border"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">{v.product_name}</p>
                          {v.variant_name && <p className="truncate text-xs text-text-muted">{v.variant_name}</p>}
                        </div>
                        {alreadyOnPo ? (
                          <span className="text-xs text-text-muted">Already added</span>
                        ) : (
                          <span className="text-xs text-text-muted">
                            <Quantity value={v.qty_on_hand} /> {v.base_unit}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSelect(pickedList)} disabled={pickedList.length === 0}>
            Add {pickedList.length > 0 ? `(${pickedList.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
