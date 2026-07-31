import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Loader2, AlertTriangle } from 'lucide-react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { useStockDialogStore, type StockDialogContext } from '@/features/inventory/stock-dialog-store'
import { invalidateInventoryQueries } from '@/features/inventory/invalidate'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { OfflineNotice } from '@/components/data/offline-notice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { QuantityInput } from '@/components/quantity/quantity-input'
import { Quantity } from '@/components/quantity/quantity'
import { toast } from '@/hooks/use-toast'
import { useActiveBusiness } from '@/features/business/hooks'
import { useAuthorizationGate } from '@/features/control/use-authorization'
import { ManagerPinModal } from '@/features/control/manager-pin-modal'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { recordActorActivity } from '@/features/control/activity'

const REASONS = [
  { value: 'miscount', label: 'Miscount', movementType: 'adjustment' as const },
  { value: 'damaged', label: 'Damaged', movementType: 'damage' as const },
  { value: 'expired', label: 'Expired', movementType: 'damage' as const },
  { value: 'theft', label: 'Theft', movementType: 'adjustment' as const },
  { value: 'returned_to_supplier', label: 'Returned to supplier', movementType: 'adjustment' as const },
  { value: 'other', label: 'Other', movementType: 'adjustment' as const },
]

const schema = z
  .object({
    variantId: z.string().min(1),
    mode: z.enum(['count', 'delta']),
    value: z.string().trim().min(1, 'Enter a value'),
    reason: z.string().min(1, 'Select a reason'),
    note: z.string().trim().optional(),
    confirmNegative: z.boolean(),
  })
  .refine((data) => data.reason !== 'other' || !!data.note?.trim(), {
    message: 'A note is required when the reason is Other',
    path: ['note'],
  })
type FormValues = z.infer<typeof schema>

function AdjustStockForm({ context, onDone }: { context: StockDialogContext; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [movementId] = useState(() => crypto.randomUUID())
  const [serverError, setServerError] = useState<string | null>(null)
  const online = useOnlineStatus()
  const { business, membership } = useActiveBusiness()
  const gate = useAuthorizationGate()
  const sessionContext = useEmployeeSessionStore((s) => s.context)
  const hasSession = sessionContext?.status === 'active'

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      variantId: context.preselectVariantId ?? context.variants[0]?.variantId ?? '',
      mode: 'count',
      value: '',
      reason: '',
      note: '',
      confirmNegative: false,
    },
  })

  const variantId = form.watch('variantId')
  const mode = form.watch('mode')
  const value = form.watch('value')
  const reason = form.watch('reason')
  const confirmNegative = form.watch('confirmNegative')

  const selectedVariant = context.variants.find((v) => v.variantId === variantId)

  const calc = useMemo(() => {
    if (!selectedVariant || value === '' || Number.isNaN(Number(value))) return null
    const qtyBefore = new Decimal(selectedVariant.qtyOnHand)
    const delta = mode === 'count' ? new Decimal(value).minus(qtyBefore) : new Decimal(value)
    const qtyAfter = qtyBefore.plus(delta)
    return { qtyBefore, delta, qtyAfter }
  }, [selectedVariant, value, mode])

  const needsConfirmation = !!calc && calc.qtyAfter.lt(0)
  const isNoOp = !!calc && calc.delta.isZero()

  async function onSubmit(values: FormValues) {
    setServerError(null)
    if (!calc || calc.delta.isZero()) return
    if (needsConfirmation && !values.confirmNegative) return

    const reasonConfig = REASONS.find((r) => r.value === values.reason)

    // Adjusting stock is a restricted action: within the operator's limit it
    // self-authorizes, above it a manager PIN is required (BR-C4.6). With no PIN
    // session the device account is acting directly and the gate is skipped.
    let authorizedBy: string | null = null
    if (hasSession) {
      const grant = await gate.request('inventory_adjustment', {
        quantity: calc.delta.abs().toString(),
      })
      if (!grant?.granted) return
      authorizedBy = grant.authorized_by ?? null
    }

    const { error } = await supabase.rpc('record_stock_movement', {
      p_movement_id: movementId,
      p_variant_id: values.variantId,
      p_location_id: context.locationId,
      p_movement_type: reasonConfig?.movementType ?? 'adjustment',
      p_quantity: calc.delta.toNumber(),
      p_reference_type: 'adjustment',
      p_note: `${reasonConfig?.label ?? 'Adjustment'}${values.note ? `: ${values.note}` : ''}`,
    })

    if (error) {
      setServerError(toReadableError(error))
      return
    }

    if (business) {
      await recordActorActivity({
        businessId: business.id,
        actionType: 'inventory_adjusted',
        fallbackMemberId: membership?.id ?? null,
        authorizedBy,
        terminalId: sessionContext?.terminal_id ?? null,
        referenceType: 'variant',
        referenceId: values.variantId,
        severity: authorizedBy && authorizedBy !== sessionContext?.member_id ? 'notice' : 'info',
        detail: {
          quantity: calc.delta.toString(),
          reason: reasonConfig?.label ?? 'Adjustment',
        },
      })
    }

    invalidateInventoryQueries(queryClient, context.productId)
    toast({ title: 'Stock adjusted' })
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

      <RadioGroup value={mode} onValueChange={(v) => form.setValue('mode', v as 'count' | 'delta')} className="grid-flow-col justify-start gap-6">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="count" id="mode-count" />
          <Label htmlFor="mode-count">Set counted quantity</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="delta" id="mode-delta" />
          <Label htmlFor="mode-delta">Add or remove</Label>
        </div>
      </RadioGroup>

      <div>
        <label className="text-sm font-medium text-text-primary">
          {mode === 'count' ? 'Counted quantity' : 'Quantity change (use a minus sign to remove)'}
        </label>
        <QuantityInput className="mt-1.5" {...form.register('value')} placeholder={mode === 'count' ? '0' : '+/-0'} />
        {selectedVariant && (
          <p className="mt-1 text-sm text-text-secondary">
            Currently <Quantity value={selectedVariant.qtyOnHand} unit={context.baseUnit} />
          </p>
        )}
      </div>

      {calc && !isNoOp && (
        <p className="text-sm text-text-secondary">
          {calc.delta.gt(0) ? '+' : ''}
          <Quantity value={calc.delta} unit={context.baseUnit} /> → new balance:{' '}
          <span className="font-medium text-text-primary"><Quantity value={calc.qtyAfter} unit={context.baseUnit} /></span>
        </p>
      )}

      <div>
        <label className="text-sm font-medium text-text-primary">Reason</label>
        <Select value={reason} onValueChange={(v) => form.setValue('reason', v)}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a reason" /></SelectTrigger>
          <SelectContent>
            {REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.reason && (
          <p className="mt-1 text-sm font-medium text-danger">{form.formState.errors.reason.message}</p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-text-primary">
          Note{reason === 'other' ? '' : ' (optional)'}
        </label>
        <Textarea className="mt-1.5" rows={2} {...form.register('note')} />
        {form.formState.errors.note && (
          <p className="mt-1 text-sm font-medium text-danger">{form.formState.errors.note.message}</p>
        )}
      </div>

      {needsConfirmation && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="size-5 shrink-0 text-danger" />
            <p className="text-sm text-text-primary">
              This will leave stock at <Quantity value={calc!.qtyAfter} unit={context.baseUnit} />, a negative
              balance. That means your records show more removed than you had on hand — a discrepancy you'll need
              to investigate.
            </p>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-text-primary">
            <Checkbox
              checked={confirmNegative}
              onCheckedChange={(checked) => form.setValue('confirmNegative', checked === true)}
            />
            I understand and want to continue
          </label>
        </div>
      )}

      {serverError && <p role="alert" className="text-sm font-medium text-danger">{serverError}</p>}
      {!online && <OfflineNotice />}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || !calc || isNoOp || (needsConfirmation && !confirmNegative) || !online}
        >
          {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Save adjustment
        </Button>
      </DialogFooter>

      {gate.pending && <ManagerPinModal pending={gate.pending} onResolve={gate.resolvePending} />}
    </form>
  )
}

export function AdjustStockDialog() {
  const context = useStockDialogStore((s) => s.adjustStockContext)
  const close = useStockDialogStore((s) => s.closeAdjustStock)

  return (
    <Dialog open={!!context} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock{context ? ` — ${context.productName}` : ''}</DialogTitle>
          <DialogDescription>Correct the recorded stock level for this item.</DialogDescription>
        </DialogHeader>
        {context && <AdjustStockForm key={context.productId + (context.preselectVariantId ?? '')} context={context} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}
