import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import {
  fetchMovementsForExport,
  useMovementHistory,
  type MovementHistoryFilters,
} from '@/features/inventory/use-movements'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { toReadableError } from '@/lib/errors'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { TableSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
import { Pagination } from '@/components/data/pagination'
import { MovementsTable } from '@/features/inventory/movements-table'
import { toast } from '@/hooks/use-toast'

const PAGE_SIZE = 50
const DEFAULT_FILTERS: MovementHistoryFilters = {}

export function MovementHistoryPage() {
  const { variantId: routeVariantId } = useParams<{ variantId: string }>()
  const [searchParams] = useSearchParams()
  const productIdParam = searchParams.get('product') ?? undefined
  const { business } = useActiveBusiness()
  const locale = useLocale()

  const [filters, setFilters] = useState<MovementHistoryFilters>({
    ...DEFAULT_FILTERS,
    variantId: routeVariantId,
    productId: productIdParam,
  })
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, isError, refetch } = useMovementHistory(filters, page, PAGE_SIZE)

  const hasActiveFilters =
    (!!filters.movementType && filters.movementType !== 'all') || !!filters.from || !!filters.to

  function updateFilters(patch: Partial<MovementHistoryFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  async function handleExport() {
    if (!business) return
    setExporting(true)
    try {
      const rows = await fetchMovementsForExport(business.id, filters)
      const header = ['Date', 'Item', 'Type', 'Quantity', 'Balance', 'Unit cost', 'User', 'Note']
      const body = rows.map((r) => [
        formatDateTime(r.created_at, business.timezone, locale),
        [r.variant?.product?.name, r.variant?.variant_name || r.variant?.option_values.join(' / ')].filter(Boolean).join(' — '),
        r.movement_type,
        r.quantity,
        r.qty_after,
        r.unit_cost,
        r.created_by_profile?.full_name ?? '',
        r.note ?? '',
      ])
      downloadCsv(`stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body])
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't export", description: toReadableError(error) })
    } finally {
      setExporting(false)
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        title="Stock movements"
        actions={
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="text-xs font-medium text-text-secondary">From</label>
            <Input
              type="date"
              className="mt-1"
              onChange={(e) => updateFilters({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">To</label>
            <Input
              type="date"
              className="mt-1"
              onChange={(e) => updateFilters({ to: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : undefined })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Type</label>
            <Select
              value={filters.movementType ?? 'all'}
              onValueChange={(v) => updateFilters({ movementType: v as MovementHistoryFilters['movementType'] })}
            >
              <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="initial">Opening stock</SelectItem>
                <SelectItem value="restock">Restock</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="sale_reversal">Return</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(hasActiveFilters || filters.variantId || filters.productId) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilters({}); setPage(1) }}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.rows.length === 0 && hasActiveFilters && (
        <FilteredEmptyState onClear={() => { setFilters({}); setPage(1) }} />
      )}

      {!isLoading && !isError && data && data.rows.length === 0 && !hasActiveFilters && (
        <EmptyState title="No stock movements yet" description="Movements will appear here as stock is added, sold, or adjusted." />
      )}

      {!isLoading && !isError && data && data.rows.length > 0 && (
        <>
          <MovementsTable rows={data.rows} showProduct />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={data.total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  )
}
