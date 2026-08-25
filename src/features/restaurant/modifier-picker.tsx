import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { Check, Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/money/money'
import { useActiveBusiness } from '@/features/business/hooks'
import { useModifierOptions, type OrderItem } from '@/features/restaurant/use-restaurant'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * Per-item modifiers: "no onions" on ONE burger on ONE table.
 *
 * They are stored against the order item rather than the product because that
 * is what they describe. A modifier on the catalog product would mean every
 * burger in the restaurant loses its onions.
 *
 * The reusable list comes from `modifier_options`, but a free-typed note is
 * always allowed: kitchens field requests nobody configured in advance, and a
 * picker that cannot express "allergic to shellfish" is a picker the server
 * works around by shouting through the pass.
 */
export function ModifierPicker({ item, onDone }: { item: OrderItem; onDone: () => void }) {
  const { business } = useActiveBusiness()
  const qc = useQueryClient()
  const { data: options } = useModifierOptions()
  const [custom, setCustom] = useState('')

  const chosen = useMemo(
    () => new Set(item.modifiers.map((m) => m.label)),
    [item.modifiers],
  )

  const groups = useMemo(() => {
    const map = new Map<string, typeof options>()
    for (const option of options ?? []) {
      const list = map.get(option.group_name) ?? []
      list.push(option)
      map.set(option.group_name, list)
    }
    return [...map.entries()]
  }, [options])

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['restaurant-orders', business?.id] })

  const addModifier = useMutation({
    mutationFn: async ({ label, priceDelta }: { label: string; priceDelta: string }) => {
      const { error } = await supabase.from('restaurant_order_item_modifiers').insert({
        order_item_id: item.id,
        business_id: business!.id,
        label,
        price_delta: priceDelta,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const removeModifier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('restaurant_order_item_modifiers')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  function fail(error: unknown) {
    toast({
      variant: 'destructive',
      title: "Couldn't change the options",
      description: toReadableError(error),
    })
  }

  function toggle(label: string, priceDelta: string) {
    const existing = item.modifiers.find((m) => m.label === label)
    if (existing) removeModifier.mutate(existing.id, { onError: fail })
    else addModifier.mutate({ label, priceDelta }, { onError: fail })
  }

  function addCustom() {
    const label = custom.trim()
    if (!label) return
    addModifier.mutate(
      { label, priceDelta: '0' },
      { onSuccess: () => setCustom(''), onError: fail },
    )
  }

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-surface p-3">
      {groups.length === 0 && (
        <p className="type-meta mb-2">
          No saved options yet — a manager can add them in Settings → Modifiers. You can still type
          one below.
        </p>
      )}

      {groups.map(([group, list]) => (
        <div key={group} className="mb-3">
          <p className="type-eyebrow mb-1.5">{group}</p>
          <div className="flex flex-wrap gap-1.5">
            {(list ?? []).map((option) => {
              const active = chosen.has(option.label)
              const delta = new Decimal(option.price_delta)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.label, option.price_delta)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-accent-primary bg-tint-accent text-tint-accent-foreground'
                      : 'border-border text-text-secondary hover:bg-surface-muted',
                  )}
                >
                  {active && <Check className="size-3.5" aria-hidden />}
                  {option.label}
                  {!delta.isZero() && (
                    <span className="tabular-nums font-semibold">
                      {delta.gt(0) ? '+' : '−'}
                      <Money value={delta.abs()} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Anything already on the item that is not in the saved list — a typed
          request — still needs a way off again. */}
      {item.modifiers.filter((m) => !(options ?? []).some((o) => o.label === m.label)).length > 0 && (
        <div className="mb-3">
          <p className="type-eyebrow mb-1.5">Typed for this item</p>
          <div className="flex flex-wrap gap-1.5">
            {item.modifiers
              .filter((m) => !(options ?? []).some((o) => o.label === m.label))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => removeModifier.mutate(m.id, { onError: fail })}
                  className="flex items-center gap-1.5 rounded-full border border-accent-primary bg-tint-accent px-3 py-1.5 text-sm font-medium text-tint-accent-foreground"
                >
                  <Check className="size-3.5" aria-hidden />
                  {m.label}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="No onions, extra sauce, allergy…"
          aria-label="Add a custom option"
          className="h-9"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addCustom}
          disabled={!custom.trim() || addModifier.isPending}
        >
          {addModifier.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add
        </Button>
      </div>

      <Button type="button" size="sm" variant="ghost" className="mt-2 w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
