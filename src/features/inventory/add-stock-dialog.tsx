import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { toQuantity, convertToBaseUnits } from '@/lib/units'
import { useStockDialogStore, type StockDialogContext } from '@/features/inventory/stock-dialog-store'
import { useProductPurchaseUnit } from '@/features/inventory/use-product-purchase-unit'
import { invalidateInventoryQueries } from '@/features/inventory/invalidate'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { OfflineNotice } from '@/components/data/offline-notice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyInput } from '@/components/money/money-input'
import { QuantityInput } from '@/components/quantity/quantity-input'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Term } from '@/features/help/term'
import { toast } from '@/hooks/use-toast'

const schema = z.object({
  variantId: z.string().min(1),
  unitMode: z.enum(['base', 'purchase']),
  quantity: z.string().trim().min(1, 'Enter a quantity').refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  unitCost: z.string().trim().min(1, 'Enter a unit cost').refine((v) => Number(v) >= 0, 'Enter a valid cost'),
  note: z.string().trim().optional(),
})
type FormValues = z.infer<typeof schema>

function AddStockForm({ context, onDone }: { context: StockDialogContext; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [movementId] = useState(() => crypto.randomUUID())
  const [serverError, setServerError] = useState<string | null>(null)
  const { data: purchaseInfo } = useProductPurchaseUnit(context.productId)
  const online = useOnlineStatus()

  const purchaseUnit = context.purchaseUnit ?? purchaseInfo?.purchase_unit ?? null
  const purchaseConversionQty = context.purchaseConversionQty ?? purchaseInfo?.purchase_conversion_qty ?? null
  const hasPurchaseUnit = !!purchaseUnit && !!purchaseConversionQty

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      variantId: context.preselectVariantId ?? context.variants[0]?.variantId ?? '',
      unitMode: hasPurchaseUnit ? 'purchase' : 'base',
      quantity: '',
      unitCost: '',
      note: '',
    },
  })

  const variantId = form.watch('variantId')
  const unitMode = form.watch('unitMode')
  const quantity = form.watch('quantity')
  const unitCost = form.watch('unitCost')

  const selectedVariant = context.variants.find((v) => v.variantId === variantId)

  const preview = useMemo(() => {
    if (!selectedVariant || !quantity || Number(quantity) <= 0) return null
    const baseQty =
      unitMode === 'purchase' && purchaseConversionQty
        ? convertToBaseUnits(quantity, purchaseConversionQty)
        : toQuantity(quantity)

    const qtyBefore = new Decimal(selectedVariant.qtyOnHand)
    const avgBefore = new Decimal(selectedVariant.avgCost)
    // Cost entered per PURCHASE unit (Cost / Carton) must divide by conversion
    // before it reaches the ledger — the ledger's unit_cost is per BASE unit
    // (FIX 007 §Issue 1). 14,900/carton ÷ 44 = 338.6364/piece.
    const rawCost = unitCost !== '' ? new Decimal(unitCost) : avgBefore
    const cost =
      unitMode === 'purchase' && purchaseConversionQty && new Decimal(purchaseConversionQty).gt(0)
        ? rawCost.div(purchaseConversionQty)
        : rawCost
    const qtyAfter = qtyBefore.plus(baseQty)
    // BR-5.3 / BR-5.5: inbound onto a zero-or-negative balance resets the average to the incoming cost.
    const avgAfter = qtyBefore.lte(0) ? cost : qtyBefore.times(avgBefore).plus(baseQty.times(cost)).div(qtyAfter)

    return { baseQty, qtyBefore, qtyAfter, avgBefore, avgAfter, cost, rawCost }
  }, [selectedVariant, quantity, unitMode, purchaseConversionQty, unitCost])

  async function onSubmit(values: FormValues) {
    setServerError(null)
    if (!preview) return

    const { error } = await supabase.rpc('record_stock_movement', {
      p_movement_id: movementId,
      p_variant_id: values.variantId,
      p_location_id: context.locationId,
      p_movement_type: 'restock',
      p_quantity: preview.baseQty.toNumber(),
      // preview.cost is already per BASE unit — divided by conversion in
      // 'purchase' mode. record_stock_movement.p_unit_cost is per base unit.
      p_unit_cost: preview.cost.toNumber(),
      p_purchase_unit_qty: values.unitMode === 'purchase' ? Number(values.quantity) : null,
      p_purchase_unit: values.unitMode === 'purchase' ? purchaseUnit : null,
      p_reference_type: 'restock',
      p_note: values.note || null,
    })

    if (error) console.error('[record_stock_movement] failed', error)
    if (error) {
      setServerError(toReadableError(error))
      return
    }

    invalidateInventoryQueries(queryClient, context.productId)
    toast({ title: 'Stock added' })
    onDone()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      {context.variants.length > 1 && (
        <div>
          <label className="text-sm font-medium text-text-primary">Variant</label>
          <Select value={variantId} onValueChange={(v) => form.setValue('variantId', v)}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {context.variants.map((v) => (
                <SelectItem key={v.variantId} value={v.variantId}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-text-primary">Quantity</label>
          <div className="mt-1.5 flex gap-2">
            <QuantityInput {...form.register('quantity')} placeholder="0" />
            {hasPurchaseUnit && (
              <Select value={unitMode} onValueChange={(v) => form.setValue('unitMode', v as 'base' | 'purchase')}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">{purchaseUnit}</SelectItem>
                  <SelectItem value="base">{context.baseUnit}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {form.formState.errors.quantity && (
            <p className="mt-1 text-sm font-medium text-danger">{form.formState.errors.quantity.message}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-text-primary">
            Cost per {unitMode === 'purchase' && purchaseUnit ? purchaseUnit : context.baseUnit}
          </label>
          <MoneyInput className="mt-1.5" {...form.register('unitCost')} placeholder="0.00" />
          {form.formState.errors.unitCost && (
            <p className="mt-1 text-sm font-medium text-danger">{form.formState.errors.unitCost.message}</p>
          )}
        </div>
      </div>

      {unitMode === 'purchase' && hasPurchaseUnit && quantity && Number(quantity) > 0 && (
        <p className="text-sm text-text-secondary">
          {quantity} {purchaseUnit} → <Quantity value={preview?.baseQty} unit={context.baseUnit} />
        </p>
      )}

      <div>
        <label className="text-sm font-medium text-text-primary">Note (optional)</label>
        <Textarea className="mt-1.5" rows={2} {...form.register('note')} />
      </div>

      {preview && (
        <div className="rounded-md border border-border bg-surface-muted/50 p-3 text-sm">
          <p className="font-medium text-text-primary">
            Adding <Quantity value={preview.baseQty} unit={context.baseUnit} /> at{' '}
            <Money value={preview.cost} />/{context.baseUnit} each
          </p>
          {unitMode === 'purchase' && purchaseConversionQty && !preview.cost.eq(preview.rawCost) && (
            <p className="mt-0.5 text-xs text-text-muted">
              <Money value={preview.rawCost} />/{purchaseUnit} ÷ {purchaseConversionQty} ={' '}
              <Money value={preview.cost} />/{context.baseUnit}
            </p>
          )}
          <p className="mt-1 text-text-secondary">
            Stock: <Quantity value={preview.qtyBefore} /> → <span className="font-medium text-text-primary"><Quantity value={preview.qtyAfter} /></span>
          </p>
          <p className="text-text-secondary">
            <Term slug="average-cost">Average cost</Term>: <Money value={preview.avgBefore} /> → <span className="font-medium text-text-primary"><Money value={preview.avgAfter} /></span>
          </p>
        </div>
      )}

      {serverError && <p role="alert" className="text-sm font-medium text-danger">{serverError}</p>}
      {!online && <OfflineNotice />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={form.formState.isSubmitting || !preview || !online}>
          {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Add stock
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AddStockDialog() {
  const context = useStockDialogStore((s) => s.addStockContext)
  const close = useStockDialogStore((s) => s.closeAddStock)

  return (
    <Dialog open={!!context} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add stock{context ? ` — ${context.productName}` : ''}</DialogTitle>
          <DialogDescription>Record incoming stock for this item.</DialogDescription>
        </DialogHeader>
        {context && <AddStockForm key={context.productId + (context.preselectVariantId ?? '')} context={context} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}
