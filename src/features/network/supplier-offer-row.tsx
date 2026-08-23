import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Check, Link2, Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import {
  useConnectionStatusMap,
  useRequestConnection,
  type MarketplaceRow,
} from '@/features/network/use-network'
import { TIER_LABELS, normaliseTier } from '@/features/network/trust-indicators'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * One supplier's offer of a product.
 *
 * The same row appears in search results, on a product's page, and on a
 * supplier's storefront, so it lives here rather than being written three
 * times and drifting. Left: who and how they perform. Right: what they charge
 * at each quantity — the price ladder is the reason a buyer is reading, so it
 * gets its own column rather than being flattened to a "from" price.
 */
export function SupplierOfferRow({
  row,
  tiers,
}: {
  row: MarketplaceRow
  /** Price breaks for this listing, cheapest quantity first. May be empty. */
  tiers?: { id: string; min_qty: string; max_qty: string | null; unit_price: string }[]
}) {
  const statusMap = useConnectionStatusMap()
  const request = useRequestConnection()
  const existing = statusMap.get(row.supplier_profile_id)
  const tier = normaliseTier(row.trust_tier)

  function connect() {
    request.mutate(row.supplier_profile_id, {
      onSuccess: () =>
        toast({
          title: 'Request sent',
          description: `${row.supplier_name} can accept it, and then they appear in your Suppliers.`,
        }),
      onError: (e) =>
        toast({
          variant: 'destructive',
          title: "Couldn't send that request",
          description: toReadableError(e),
        }),
    })
  }

  return (
    <div className="rounded-2xl bg-card p-4 shadow-e2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/network/suppliers/${row.supplier_profile_id}`}
            className="type-heading block truncate hover:underline"
          >
            {row.supplier_name}
          </Link>
          <p className="type-meta mt-0.5 truncate">{row.location_text ?? 'Location not given'}</p>

          {/* Facts, not a composite score. Each is separately checkable. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-text-secondary">
            {row.completed_orders > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                <strong className="font-semibold text-text-primary">
                  {row.completed_orders}
                </strong>{' '}
                order{row.completed_orders === 1 ? '' : 's'} completed
              </span>
            ) : (
              <span>New supplier</span>
            )}
            {row.avg_response_minutes != null && (
              <>
                <Dot />
                <span>Usually responds in {formatMinutes(row.avg_response_minutes)}</span>
              </>
            )}
            {row.fulfillment_rate != null && (
              <>
                <Dot />
                <span>{Number(row.fulfillment_rate).toFixed(0)}% fulfilled</span>
              </>
            )}
            <Dot />
            <span>
              MOQ {new Decimal(row.min_order_qty).toString()} {row.purchase_unit}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[0.8125rem] font-semibold text-text-secondary">{TIER_LABELS[tier]}</p>

          {tiers && tiers.length > 0 ? (
            <table className="mt-1.5 ml-auto text-[0.8125rem]">
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id}>
                    <td className="pr-3 text-right text-text-muted">
                      {tierLabel(t.min_qty, t.max_qty, row.purchase_unit)}
                    </td>
                    <td className="text-right font-bold tabular-nums text-text-primary">
                      <Money value={t.unit_price} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : row.from_price ? (
            <p className="mt-1.5 text-base font-bold tabular-nums text-accent-primary">
              <Money value={row.from_price} />
              <span className="ml-1 text-[0.8125rem] font-medium text-text-muted">
                per {row.purchase_unit}
              </span>
            </p>
          ) : (
            <p className="type-meta mt-1.5">Price on request</p>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/network/suppliers/${row.supplier_profile_id}`}>View supplier</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/network/listings/${row.listing_id}`}>See listing</Link>
        </Button>
        {existing?.status === 'accepted' ? (
          <Button size="sm" variant="outline" disabled>
            <Check className="size-3.5" /> Connected
          </Button>
        ) : existing?.status === 'requested' ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="size-3.5" /> Requested
          </Button>
        ) : (
          <Button size="sm" onClick={connect} disabled={request.isPending}>
            <Link2 className="size-3.5" /> Connect
          </Button>
        )}
      </div>
    </div>
  )
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-text-disabled">
      ·
    </span>
  )
}

export function tierLabel(min: string, max: string | null, unit: string): string {
  const from = new Decimal(min).toString()
  if (!max) return `${from}+ ${unit}`
  return `${from}–${new Decimal(max).toString()} ${unit}`
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`
  return `${Math.round(hours / 24)} days`
}
