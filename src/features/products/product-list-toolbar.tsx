import { useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategories } from '@/features/products/categories-hooks'
import { useActiveBusiness } from '@/features/business/hooks'
import { useDensityStore } from '@/features/products/density-store'
import type { ProductListFilters } from '@/features/products/use-product-list'
import type { StockStatus } from '@/types/database'
import { cn } from '@/lib/utils'

export type SortKey = 'name' | 'stock' | 'price'

export function ProductListToolbar({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
}: {
  filters: ProductListFilters
  onFiltersChange: (filters: ProductListFilters) => void
  sort: SortKey
  onSortChange: (sort: SortKey) => void
}) {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const { role } = useActiveBusiness()
  const density = useDensityStore((s) => s.density)
  const setDensity = useDensityStore((s) => s.setDensity)
  const canManage = role === 'owner' || role === 'manager'

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Search name, SKU, or barcode"
            className="pl-9"
            aria-label="Search products"
          />
        </div>

        {canManage && (
          <Button onClick={() => navigate('/products/new')}>
            <Plus className="size-4" /> New product
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.categoryId}
          onValueChange={(v) => onFiltersChange({ ...filters, categoryId: v })}
        >
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v) => onFiltersChange({ ...filters, status: v as StockStatus | 'all' })}
        >
          <SelectTrigger className="w-40"><SelectValue placeholder="Stock status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="out_of_stock">Out of stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="ok">In stock</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.active}
          onValueChange={(v) => onFiltersChange({ ...filters, active: v as ProductListFilters['active'] })}
        >
          <SelectTrigger className="w-32"><SelectValue placeholder="Active" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => onSortChange(v as SortKey)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="stock">Stock</SelectItem>
            <SelectItem value="price">Price</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setDensity('table')}
            aria-label="Table view"
            aria-pressed={density === 'table'}
            className={cn('flex size-9 items-center justify-center rounded-sm', density === 'table' ? 'bg-surface-muted text-text-primary' : 'text-text-muted')}
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setDensity('grid')}
            aria-label="Grid view"
            aria-pressed={density === 'grid'}
            className={cn('flex size-9 items-center justify-center rounded-sm', density === 'grid' ? 'bg-surface-muted text-text-primary' : 'text-text-muted')}
          >
            <LayoutGrid className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
