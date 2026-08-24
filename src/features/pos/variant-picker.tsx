import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useCartStore } from '@/features/pos/cart-store'
import { variantLabel, type GroupedProduct, type VariantStockRow } from '@/features/products/types'
import { cn } from '@/lib/utils'

/**
 * Axis labels for a product's variants.
 *
 * `v_variant_stock` carries `option_values` (a positional text[]) but not the
 * product-level `option_names` that say what each position MEANS. Without them
 * a boutique picker can only offer "Option 1 / Option 2", so the names are
 * read from `products` on demand — one row, only when a picker opens.
 *
 * NOTE for anyone following the 12B directive: `option_values` is a `text[]`
 * positionally matched to `products.option_names`, NOT jsonb. The directive
 * says jsonb; the schema says otherwise, and the schema wins.
 */
function useOptionNames(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-option-names', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('option_names')
        .eq('id', productId!)
        .maybeSingle()
      if (error) {
        console.error('[products.option_names] failed', { productId, error })
        throw error
      }
      return ((data as { option_names?: string[] } | null)?.option_names ?? []) as string[]
    },
    enabled: !!productId,
    staleTime: 5 * 60_000,
  })
}

interface Axis {
  name: string
  index: number
  values: string[]
}

/**
 * Variant-forward selection — the boutique personality's main interaction.
 *
 * Reads the EXISTING variant model rather than adding a second one: each axis
 * is a position in `option_names`, and its choices are the distinct values at
 * that position across the product's variants. A combination that no variant
 * covers is shown as unavailable rather than hidden, because "we don't stock
 * that size in that colour" is an answer a shopper is owed.
 */
export function VariantPicker({
  product,
  onAdded,
}: {
  product: GroupedProduct
  onAdded?: () => void
}) {
  const addLine = useCartStore((s) => s.addLine)
  const { data: optionNames, isLoading } = useOptionNames(product.productId)

  const axes: Axis[] = useMemo(() => {
    const names = optionNames ?? []
    if (names.length === 0) return []
    return names.map((name, index) => ({
      name,
      index,
      values: [
        ...new Set(
          product.variants
            .map((v) => v.option_values[index])
            .filter((value): value is string => !!value),
        ),
      ],
    }))
  }, [optionNames, product.variants])

  const [selection, setSelection] = useState<(string | null)[]>([])

  const chosen = useMemo(() => {
    if (axes.length === 0) return null
    if (selection.length !== axes.length || selection.some((s) => s === null)) return null
    return (
      product.variants.find((v) =>
        axes.every((axis) => v.option_values[axis.index] === selection[axis.index]),
      ) ?? null
    )
  }, [axes, selection, product.variants])

  /**
   * Whether picking `value` on `axis` can still lead to a real variant given
   * everything else already chosen. Greying the impossible combinations is the
   * difference between a picker and a guessing game.
   */
  function isReachable(axis: Axis, value: string): boolean {
    return product.variants.some((v) => {
      if (v.option_values[axis.index] !== value) return false
      return axes.every((other) => {
        if (other.index === axis.index) return true
        const picked = selection[other.index]
        return !picked || v.option_values[other.index] === picked
      })
    })
  }

  function pick(axis: Axis, value: string) {
    setSelection((current) => {
      const next = [...current]
      // Normalise length first — an unset axis is `null`, never `undefined`,
      // so the completeness check above stays a simple `some(=== null)`.
      while (next.length < axes.length) next.push(null)
      next[axis.index] = next[axis.index] === value ? null : value
      return next
    })
  }

  function add(variant: VariantStockRow) {
    addLine({
      variantId: variant.variant_id,
      productName: product.productName,
      variantName: variantLabel(variant),
      baseUnit: product.baseUnit,
      unitPrice: new Decimal(variant.selling_price),
      imagePath: product.imagePath,
    })
    setSelection([])
    onAdded?.()
  }

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />
  }

  // A product whose variants carry no named axes (legacy data, or a product
  // built before option_names were filled in) still has to be sellable, so it
  // falls back to a plain list of its variants.
  if (axes.length === 0) {
    return (
      <div className="space-y-1">
        {product.variants.map((v) => (
          <button
            key={v.variant_id}
            type="button"
            onClick={() => add(v)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-background"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
              {variantLabel(v)}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-text-primary">
              <Money value={v.selling_price} />
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {axes.map((axis) => (
        <div key={axis.name}>
          <p className="type-eyebrow mb-2">{axis.name}</p>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const active = selection[axis.index] === value
              const reachable = isReachable(axis, value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pick(axis, value)}
                  disabled={!reachable}
                  aria-pressed={active}
                  className={cn(
                    'min-h-10 min-w-11 rounded-xl px-3.5 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-accent-primary text-primary-foreground'
                      : reachable
                        ? 'bg-background text-text-primary hover:bg-surface-muted'
                        : 'cursor-not-allowed bg-background text-text-disabled line-through',
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="rounded-xl bg-background p-3">
        {chosen ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
                {variantLabel(chosen)}
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-text-primary">
                <Money value={chosen.selling_price} />
              </span>
            </div>
            <p className="type-meta mt-0.5">
              {Number(chosen.qty_on_hand) > 0
                ? `${new Decimal(chosen.qty_on_hand).toString()} in stock`
                : 'Out of stock'}
            </p>
            <Button className="mt-3 w-full" onClick={() => add(chosen)}>
              <Check className="size-4" /> Add to sale
            </Button>
          </>
        ) : (
          <p className="type-meta">
            Pick {axes.map((a) => a.name.toLowerCase()).join(' and ')} to add this.
          </p>
        )}
      </div>
    </div>
  )
}
