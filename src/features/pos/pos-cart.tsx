import { useState } from 'react'
import Decimal from 'decimal.js'
import { Minus, Package, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import {
  useCartStore,
  cartSubtotal,
  cartDiscountTotal,
  cartNetTotal,
  lineDiscount,
  type CartLine,
} from '@/features/pos/cart-store'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { MoneyInput } from '@/components/money/money-input'
import { CustomerBar } from '@/features/pos/customer-picker'
import { useActiveBusiness } from '@/features/business/hooks'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { cn } from '@/lib/utils'

/**
 * The basket.
 *
 * Three stacked zones — header, scrolling lines, totals pinned to the bottom
 * with ONE full-width primary action. Nothing else on this panel is allowed to
 * be accent-coloured: Charge is the only thing a cashier should ever have to
 * find in a hurry.
 */
export function PosCart({
  onCharge,
  onRemoveLine,
  onClear,
  chargeDisabled,
  captureCustomer = false,
  allowLineDiscount = false,
}: {
  onCharge: () => void
  /** Supplied where a removal is a gated action, so it can route through the authorization modal. */
  onRemoveLine?: (variantId: string) => void
  onClear?: () => void
  chargeDisabled?: boolean
  /** capture_customer — show the customer bar above the lines. */
  captureCustomer?: boolean
  /** allow_line_discount — offer a per-line discount control. */
  allowLineDiscount?: boolean
}) {
  const lines = useCartStore((s) => s.lines)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const removeLine = useCartStore((s) => s.removeLine)
  const subtotal = cartSubtotal(lines)
  const discountTotal = cartDiscountTotal(lines)
  const netTotal = cartNetTotal(lines)
  const handleRemove = onRemoveLine ?? removeLine

  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    lines.map((l) => l.imagePath ?? null),
  )

  const itemCount = lines.reduce((sum, l) => sum.plus(l.quantity), new Decimal(0))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="type-title">Current sale</h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[0.8125rem] font-semibold text-text-muted transition-colors hover:text-danger"
          >
            Clear
          </button>
        )}
      </div>

      {captureCustomer && lines.length > 0 && (
        <div className="shrink-0 px-4 pb-2">
          <CustomerBar />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-background">
              <ShoppingBag className="size-6 text-icon-muted" aria-hidden="true" />
            </span>
            <p className="type-heading mt-3">No items yet</p>
            <p className="type-meta mt-1">Scan a barcode or tap a product to start.</p>
          </div>
        ) : (
          <ul className="space-y-1.5 pb-2">
            {lines.map((line) => {
              const url = line.imagePath ? imageUrls?.get(line.imagePath) : undefined
              const gross = line.quantity.times(line.unitPrice)
              const discount = lineDiscount(line)
              const lineTotal = gross.minus(discount)

              return (
                <li
                  key={line.variantId}
                  className="group flex min-w-0 gap-3 rounded-2xl p-2.5 transition-colors hover:bg-background"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tint-accent/50">
                    {url ? (
                      <img src={url} alt="" className="size-full object-cover" />
                    ) : (
                      <Package className="size-4 text-tint-accent-foreground/50" aria-hidden="true" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {line.productName}
                    </p>
                    <p className="type-meta truncate">
                      {line.variantName ?? line.baseUnit} ·{' '}
                      <Money value={line.unitPrice} /> each
                    </p>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 rounded-full bg-background p-0.5">
                        <Stepper
                          label={`Decrease ${line.productName}`}
                          onClick={() => setQuantity(line.variantId, line.quantity.minus(1))}
                        >
                          <Minus className="size-3.5" />
                        </Stepper>
                        <span className="min-w-6 text-center text-sm font-bold tabular-nums text-text-primary">
                          {line.quantity.toString()}
                        </span>
                        <Stepper
                          label={`Increase ${line.productName}`}
                          onClick={() => setQuantity(line.variantId, line.quantity.plus(1))}
                        >
                          <Plus className="size-3.5" />
                        </Stepper>
                      </div>

                      <span className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">
                        {discount.gt(0) && (
                          <span className="mr-1.5 font-medium text-text-muted line-through">
                            <Money value={gross} />
                          </span>
                        )}
                        <Money value={lineTotal} />
                      </span>
                    </div>

                    {allowLineDiscount && (
                      <LineDiscountControl line={line} gross={gross} discount={discount} />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(line.variantId)}
                    aria-label={`Remove ${line.productName}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-icon-muted opacity-0 transition-all hover:bg-tint-danger hover:text-tint-danger-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 p-4">
        <div className="rounded-2xl bg-background p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              Subtotal
              {itemCount.gt(0) && (
                <span className="text-text-muted">
                  {' '}
                  · {itemCount.toString()} item{itemCount.eq(1) ? '' : 's'}
                </span>
              )}
            </span>
            <span className="font-semibold tabular-nums text-text-primary">
              <Money value={subtotal} />
            </span>
          </div>

          {discountTotal.gt(0) && (
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Discount</span>
              <span className="font-semibold tabular-nums text-success">
                −<Money value={discountTotal} />
              </span>
            </div>
          )}

          <div className="my-3 border-t border-dashed border-border" />

          <div className="flex items-baseline justify-between">
            <span className="text-[0.9375rem] font-semibold text-text-primary">Total</span>
            <span className="text-2xl font-bold tabular-nums text-text-primary">
              <Money value={netTotal} />
            </span>
          </div>
        </div>

        <Button
          className="mt-3 h-14 w-full text-base"
          onClick={onCharge}
          disabled={chargeDisabled || lines.length === 0}
        >
          Charge <Money value={netTotal} />
        </Button>
        <p className="type-meta mt-2 text-center">
          <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold">
            F2
          </kbd>{' '}
          to charge
        </p>
      </div>
    </div>
  )
}

/**
 * The per-line discount editor.
 *
 * A closed chip until tapped, so the common no-discount case adds no clutter to
 * a busy cart. The amount is a proposal: it is stored on the line and sent to
 * complete_sale_v2, which reads the price itself and clamps the discount to the
 * line — the client can never set a price, only ask for money off one. The
 * input is bounded to the line's gross here too so the displayed total stays
 * honest before it reaches the server.
 */
function LineDiscountControl({
  line,
  gross,
  discount,
}: {
  line: CartLine
  gross: Decimal
  discount: Decimal
}) {
  const { business } = useActiveBusiness()
  const setLineDiscount = useCartStore((s) => s.setLineDiscount)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  if (!open && discount.lte(0)) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft('')
          setOpen(true)
        }}
        className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-text-muted transition-colors hover:text-accent-primary"
      >
        <Tag className="size-3.5" aria-hidden /> Add discount
      </button>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(discount.toString())
          setOpen(true)
        }}
        className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success transition-colors hover:text-accent-primary"
      >
        <Tag className="size-3.5" aria-hidden /> −<Money value={discount} /> off · edit
      </button>
    )
  }

  function commit() {
    const trimmed = draft.trim()
    if (!trimmed) {
      setLineDiscount(line.variantId, null)
      setOpen(false)
      return
    }
    let value = new Decimal(trimmed || '0')
    if (value.lt(0)) value = new Decimal(0)
    if (value.gt(gross)) value = gross
    setLineDiscount(line.variantId, value)
    setOpen(false)
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <MoneyInput
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setOpen(false)
        }}
        aria-label={`Discount for ${line.productName}, up to ${gross.toString()}`}
        autoFocus
        className="h-8 text-sm"
      />
      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={commit}>
        Apply
      </Button>
      {discount.gt(0) && (
        <button
          type="button"
          onClick={() => {
            setLineDiscount(line.variantId, null)
            setOpen(false)
          }}
          aria-label="Remove discount"
          className="shrink-0 rounded-md p-1 text-icon-muted hover:text-danger"
        >
          <X className="size-4" />
        </button>
      )}
      {business && <span className="sr-only">Currency {business.currency_code}</span>}
    </div>
  )
}

function Stepper({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-full bg-surface text-text-secondary shadow-e1 transition-colors',
        'hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
