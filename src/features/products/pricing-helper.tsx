import Decimal from 'decimal.js'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'

interface PricingHelperProps {
  hasPurchaseUnit: boolean
  purchaseUnit: string
  baseUnit: string
  conversion: string
  costPrice: string
  sellingPrice: string
}

/**
 * Live purchase/sales breakdown shown beneath the cost + selling-price inputs
 * when a product buys in one unit (e.g. carton) and sells in another (piece).
 * Cost is entered per purchase unit; selling price stays per base unit —
 * ledger conversion still happens at receiving (FIX 006 §Issue 2).
 */
export function PricingHelperPreview({
  hasPurchaseUnit,
  purchaseUnit,
  baseUnit,
  conversion,
  costPrice,
  sellingPrice,
}: PricingHelperProps) {
  const conv = new Decimal(conversion || '0')
  const cost = new Decimal(costPrice || '0')
  const sell = new Decimal(sellingPrice || '0')

  const showPurchase = hasPurchaseUnit && purchaseUnit && conv.gt(0) && cost.gt(0)
  const showSales = sell.gt(0)
  if (!showPurchase && !showSales) return null

  const perBaseCost = showPurchase ? cost.div(conv) : new Decimal(0)
  const revenuePerCarton = showSales && hasPurchaseUnit && conv.gt(0) ? sell.times(conv) : null
  const profitPerCarton =
    showPurchase && showSales ? sell.minus(perBaseCost).times(conv) : null

  return (
    <div className="col-span-2 rounded-md border border-accent-primary/20 bg-accent-primary/5 p-3 text-sm text-text-secondary">
      {showPurchase && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Purchase</p>
          <p>
            1 <span className="font-medium">{purchaseUnit}</span> = <Money value={cost.toString()} />
          </p>
          <p>
            ≈ <span className="font-semibold text-accent-primary"><Money value={perBaseCost.toFixed(4)} /></span> per {baseUnit}
          </p>
        </div>
      )}
      {showSales && (
        <div className={showPurchase ? 'mt-3 space-y-1 border-t border-accent-primary/20 pt-3' : 'space-y-1'}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sales</p>
          <p>
            <span className="font-medium"><Money value={sell.toString()} /></span> per {baseUnit}
          </p>
          {revenuePerCarton && (
            <p>
              ≈ <span className="font-medium"><Money value={revenuePerCarton.toFixed(4)} /></span> revenue per {purchaseUnit}
            </p>
          )}
          {profitPerCarton && (
            <p>
              ≈{' '}
              <span className={profitPerCarton.gte(0) ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                <Money value={profitPerCarton.toFixed(4)} />
              </span>{' '}
              gross profit per {purchaseUnit} <span className="text-xs text-text-muted">(estimate)</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Suffix like "(per Carton)" or "(per Piece)" driven by the selected units. */
export function pricingLabel(base: string, unit: string): string {
  return `${base} (per ${unit})`
}

export function thresholdLabel(baseUnit: string): string {
  // Pluralize simply — good enough for common English units.
  const plural = baseUnit.endsWith('s') ? baseUnit : `${baseUnit}s`
  return `Low-stock threshold (${plural})`
}

// Re-export Quantity so consumers can compose a preview with base-unit qty too.
export { Quantity }
