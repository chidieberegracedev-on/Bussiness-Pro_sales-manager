import { useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton, CardGridSkeleton } from '@/components/data/loading-state'
import { Pagination } from '@/components/data/pagination'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useProductList, type ProductListFilters } from '@/features/products/use-product-list'
import { useDensityStore } from '@/features/products/density-store'
import { ProductListToolbar, type SortKey } from '@/features/products/product-list-toolbar'
import { ProductTable } from '@/features/products/product-table'
import { ProductCardGrid } from '@/features/products/product-card-grid'
import { useActiveBusiness } from '@/features/business/hooks'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

const PAGE_SIZE = 50
const DEFAULT_FILTERS: ProductListFilters = { search: '', categoryId: 'all', status: 'all', active: 'active' }

export function ProductListPage() {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const [filters, setFilters] = useState<ProductListFilters>(DEFAULT_FILTERS)
  const debouncedSearch = useDebouncedValue(filters.search, 300)
  const queryFilters = { ...filters, search: debouncedSearch }
  const [sort, setSort] = useState<SortKey>('name')
  const [page, setPage] = useState(1)
  const density = useDensityStore((s) => s.density)
  const canManage = role === 'owner' || role === 'manager'

  const { data: products, isLoading, isError, refetch } = useProductList(queryFilters)

  const sorted = useMemo(() => {
    if (!products) return []
    const list = [...products]
    if (sort === 'name') list.sort((a, b) => a.productName.localeCompare(b.productName))
    if (sort === 'stock') list.sort((a, b) => Number(a.totalQty) - Number(b.totalQty))
    if (sort === 'price') list.sort((a, b) => Number(a.priceMin) - Number(b.priceMin))
    return list
  }, [products, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hasActiveFilters =
    filters.search !== '' || filters.categoryId !== 'all' || filters.status !== 'all' || filters.active !== 'active'

  function handleFiltersChange(next: ProductListFilters) {
    setFilters(next)
    setPage(1)
  }

  return (
    <div>
      <PageHeader
        title="Products"
        actions={
          canManage && (
            <Button onClick={() => navigate('/products/new')} className="hidden sm:inline-flex">
              New product
            </Button>
          )
        }
      />

      <ProductListToolbar filters={filters} onFiltersChange={handleFiltersChange} sort={sort} onSortChange={setSort} />

      {isLoading && (density === 'table' ? <TableSkeleton /> : <CardGridSkeleton />)}

      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && sorted.length === 0 && hasActiveFilters && (
        <FilteredEmptyState onClear={() => handleFiltersChange(DEFAULT_FILTERS)} />
      )}

      {!isLoading && !isError && sorted.length === 0 && !hasActiveFilters && (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product to start tracking inventory."
          action={canManage && <Button onClick={() => navigate('/products/new')}>New product</Button>}
        />
      )}

      {!isLoading && !isError && pageItems.length > 0 && (
        <>
          {density === 'table' ? <ProductTable products={pageItems} /> : <ProductCardGrid products={pageItems} />}
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={sorted.length} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  )
}
