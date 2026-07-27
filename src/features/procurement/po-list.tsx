import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Plus, ChevronRight, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { Money } from '@/components/money/money'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePurchaseOrders } from '@/features/procurement/use-purchase-orders'
import { useSuppliers } from '@/features/procurement/use-suppliers'
import { PoStatusBadge } from '@/features/procurement/po-status-badge'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDate } from '@/lib/format'
import type { PoStatus } from '@/types/database'

export function PurchaseOrdersListPage() {
  const navigate = useNavigate()
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canCreate = role === 'owner' || role === 'manager'

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [statusFilter, setStatusFilter] = useState<PoStatus | 'all'>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')

  const { data: suppliers } = useSuppliers(true)
  const { data: orders, isLoading, isError, refetch } = usePurchaseOrders({
    status: statusFilter,
    supplierId: supplierFilter,
  })

  const filtered = useMemo(() => {
    if (!orders) return []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return orders
    return orders.filter(
      (o) =>
        String(o.po_number).includes(q) ||
        o.supplier_name.toLowerCase().includes(q),
    )
  }, [orders, debouncedSearch])

  const hasFilters = statusFilter !== 'all' || supplierFilter !== 'all' || debouncedSearch !== ''

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="What you're buying, and what has been received."
        actions={
          canCreate && (
            <Button onClick={() => navigate('/purchase-orders/new')}>
              <Plus className="size-4" /> New PO
            </Button>
          )
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO number or supplier…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PoStatus | 'all')}>
            <SelectTrigger className="w-44" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="partially_received">Partially received</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-52" aria-label="Filter by supplier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {(suppliers ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton rows={5} columns={5} />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && orders && orders.length === 0 && !hasFilters && (
        <EmptyState
          icon={ShoppingBag}
          title="No purchase orders yet"
          description="Create your first PO to start tracking what you buy."
          action={
            canCreate && (
              <Button onClick={() => navigate('/purchase-orders/new')}>
                <Plus className="size-4" /> New PO
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && orders && orders.length > 0 && filtered.length === 0 && (
        <FilteredEmptyState
          onClear={() => {
            setSearch('')
            setStatusFilter('all')
            setSupplierFilter('all')
          }}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map((po) => (
            <li key={po.id}>
              <button
                type="button"
                onClick={() => navigate(`/purchase-orders/${po.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-xs font-bold text-accent-primary">
                  #{po.po_number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-text-primary">{po.supplier_name}</p>
                    <PoStatusBadge status={po.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {business && formatDate(po.created_at, business.timezone, locale)} · {po.item_count} item{po.item_count === '1' ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-primary">
                    <Money value={po.expected_total} />
                  </p>
                  <p className="text-xs text-text-muted">est. total</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
