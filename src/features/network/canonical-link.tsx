import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Search, Check, Plus, Loader2, X, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  useVariantCanonical,
  useCanonicalSearch,
  useCanonicalByGtin,
  useLinkVariantToCanonical,
  useCreateCanonicalProduct,
} from '@/features/network/use-network'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * Links one of this business's variants to the shared catalog.
 *
 * This is small on purpose, but it is the hinge the whole network turns on:
 * until "the thing I stock" and "the thing suppliers sell" are the same
 * identity, low stock can't find suppliers and two suppliers' offers can't be
 * compared. Barcode first — a GTIN match is exact, where a name match is a
 * guess.
 *
 * Nothing private crosses over. The link stores a catalog id on the variant;
 * the catalog never learns what the variant cost or how many are on the shelf.
 */
export function CanonicalLink({
  variantId,
  variantName,
  barcode,
  baseUnit,
}: {
  variantId: string
  variantName: string
  barcode?: string | null
  baseUnit: string
}) {
  const { data: linked, isLoading } = useVariantCanonical(variantId)
  const { data: byGtin } = useCanonicalByGtin(barcode)
  const link = useLinkVariantToCanonical()
  const create = useCreateCanonicalProduct()

  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const { data: results, isFetching } = useCanonicalSearch(debounced)

  function linkTo(canonicalProductId: string | null, label: string) {
    link.mutate(
      { variantId, canonicalProductId },
      {
        onSuccess: () =>
          toast({
            title: canonicalProductId ? 'Linked to the catalog' : 'Unlinked',
            description: canonicalProductId
              ? `${variantName} is now recognised as ${label} across the network.`
              : undefined,
          }),
        onError: (e) =>
          toast({
            variant: 'destructive',
            title: "Couldn't link that",
            description: toReadableError(e),
          }),
      },
    )
  }

  async function createAndLink() {
    try {
      const created = await create.mutateAsync({
        name: search.trim() || variantName,
        gtin: barcode ?? null,
        baseUnit,
      })
      linkTo(created.id, created.name)
      setSearch('')
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't add it to the catalog",
        description: toReadableError(error),
      })
    }
  }

  if (isLoading) {
    return <Loader2 className="size-4 animate-spin text-text-muted" />
  }

  if (linked) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted/50 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <Check className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{linked.name}</p>
          <p className="truncate text-xs text-text-muted">
            {linked.brand ?? linked.category ?? 'In the shared catalog'}
            {linked.gtin && ` · ${linked.gtin}`}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/network?product=${linked.id}`}>
            <Globe className="size-3.5" /> Find suppliers
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Unlink from catalog"
          onClick={() => linkTo(null, '')}
        >
          <X className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm text-text-secondary">
        Link this to the shared catalog so you can find suppliers for it on the network and compare
        their prices.
      </p>

      {byGtin && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-success/30 bg-success/5 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{byGtin.name}</p>
            <p className="text-xs text-text-secondary">
              Matched exactly by barcode {byGtin.gtin}
            </p>
          </div>
          <Button size="sm" onClick={() => linkTo(byGtin.id, byGtin.name)} disabled={link.isPending}>
            <Check className="size-3.5" /> Use this
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the catalog by name"
          className="pl-9"
          aria-label="Search the shared catalog"
        />
      </div>

      {isFetching && <Loader2 className="size-4 animate-spin text-text-muted" />}

      {(results ?? []).length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(results ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2">
              <Boxes className="size-4 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{row.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {row.brand ?? row.category ?? row.gtin ?? '—'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => linkTo(row.id, row.name)}
                disabled={link.isPending}
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}

      {debounced.trim().length >= 2 && !isFetching && (results ?? []).length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3">
          <p className="min-w-0 text-sm text-text-secondary">
            Nothing in the catalog matches "{debounced.trim()}".
          </p>
          <Button size="sm" variant="outline" onClick={createAndLink} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Add it
          </Button>
        </div>
      )}
    </div>
  )
}
