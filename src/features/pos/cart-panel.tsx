import Decimal from 'decimal.js'
import { Minus, Plus, X, ShoppingCart, Package } from 'lucide-react'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { useSignedImageUrls } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { cn } from '@/lib/utils'

/**
 * The cart column.
 *
 * Fixed width, three stacked zones: header, scrolling item list, and a totals
 * block pinned to the bottom with the one primary action. Only two things on
 * this panel carry the accent — the prices and Take payment — because an
 * accent that appears five times stops meaning "this one".
 */
export function CartPanel({
  onTakePayment,
  onRemoveLine,
  onClear,
}: {
  onTakePayment: () => void
  /**
   * Supplied by the Registry Workspace so a removal routes through the
   * authorization gate. Falls back to a direct removal in the management POS,
   * where the operator is already the account holder.
   */
  onRemoveLine?: (variantId: string) => void
  onClear?: () => void
}) {
  const lines = useCartStore((s) => s.lines)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const removeLine = useCartStore((s) => s.removeLine)
  const subtotal = cartSubtotal(lines)
  const handleRemove = onRemoveLine ?? removeLine

  const { data: imageUrls } = useSignedImageUrls(
    PRODUCT_IMAGE_BUCKET,
    lines.map((l) => l.imagePath ?? null),
  )

  const itemCount = lines.reduce((sum, l) => sum.plus(l.quantity), new Decimal(0))

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 pb-3">
        <h2 className="text-base font-semibold text-text-primary">Detail items</h2>
        {lines.length > 0 && (
          <span className="shrink-0 text-xs text-text-muted">
            {itemCount.toString()} item{itemCount.eq(1) ? '' : 's'}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <ShoppingCart className="size-8 text-text-muted" />
            <p className="text-sm font-medium text-text-primary">Cart is empty</p>
            <p className="text-sm text-text-secondary">Scan or search for a product to add it here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const url = line.imagePath ? imageUrls?.get(line.imagePath) : undefined
              return (
                <li
                  key={line.variantId}
                  // No border: inside a lifted panel, a row is a row. Boxing
                  // each one turned the cart into a stack of little cards.
                  className="group flex min-w-0 items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-background"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tint-accent/60">
                    {url ? (
                      <img src={url} alt="" className="size-full object-cover" />
                    ) : (
                      <Package className="size-4 text-tint-accent-foreground/50" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {line.productName}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {line.variantName ?? line.baseUnit}
                    </p>
                    <p className="truncate text-sm font-bold text-accent-primary">
                      <Money value={line.quantity.times(line.unitPrice)} />
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <StepperButton
                      label={`Decrease quantity of ${line.productName}`}
                      onClick={() => setQuantity(line.variantId, line.quantity.minus(1))}
                    >
                      <Minus className="size-3.5" />
                    </StepperButton>
                    <span className="w-7 text-center text-sm font-medium tabular-nums text-text-primary">
                      {line.quantity.toString()}
                    </span>
                    <StepperButton
                      tone="accent"
                      label={`Increase quantity of ${line.productName}`}
                      onClick={() => setQuantity(line.variantId, line.quantity.plus(1))}
                    >
                      <Plus className="size-3.5" />
                    </StepperButton>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(line.variantId)}
                    aria-label={`Remove ${line.productName} from cart`}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className="shrink-0 pt-3">
          <p className="mb-2 text-sm font-semibold text-text-primary">Detail payment</p>

          <dl className="space-y-1.5 text-sm">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <dt className="truncate text-text-secondary">Sub total</dt>
              <dd className="shrink-0 tabular-nums text-text-primary">
                <Money value={subtotal} />
              </dd>
            </div>
          </dl>

          {/* Dashed rule: the total is a conclusion, not another line item. */}
          <div className="my-2.5 border-t border-dashed border-border" />

          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">Total payment</span>
            <span className="shrink-0 text-lg font-bold tabular-nums text-text-primary">
              <Money value={subtotal} />
            </span>
          </div>

          <Button className="mt-3 w-full" size="lg" onClick={onTakePayment}>
            Take payment
          </Button>

          {/* Neutral at rest, red on approach. A destructive action needs to
              be findable, not loud — permanent red competes with the one accent
              that's meant to lead. */}
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 w-full text-text-secondary hover:bg-danger/5 hover:text-danger"
              onClick={onClear}
            >
              Clear basket
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function StepperButton({
  label,
  onClick,
  children,
  tone = 'neutral',
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  /** Add carries a soft accent tint — it is the direction the cart grows. */
  tone?: 'neutral' | 'accent'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex size-7 items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        tone === 'accent'
          ? 'bg-tint-accent text-tint-accent-foreground hover:bg-accent-primary hover:text-primary-foreground'
          : 'border border-border text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
