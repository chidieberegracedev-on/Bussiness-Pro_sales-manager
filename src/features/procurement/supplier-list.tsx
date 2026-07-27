import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Search, Plus, ChevronRight, Mail, Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useSuppliers } from '@/features/procurement/use-suppliers'
import { useActiveBusiness } from '@/features/business/hooks'

export function SupplierListPage() {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const canManage = role === 'owner' || role === 'manager'
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [includeInactive, setIncludeInactive] = useState(false)

  const { data: suppliers, isLoading, isError, refetch } = useSuppliers(includeInactive)

  const filtered = useMemo(() => {
    if (!suppliers) return []
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q),
    )
  }, [suppliers, debouncedSearch])

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who you buy from — with per-supplier pack sizes for accurate cost."
        actions={
          canManage && (
            <Button onClick={() => navigate('/suppliers/new')}>
              <Plus className="size-4" /> New supplier
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
              placeholder="Search by name, phone, or email"
              className="pl-9"
              aria-label="Search suppliers"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Show inactive
          </label>
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton rows={5} columns={3} />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && suppliers && suppliers.length === 0 && (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Add the businesses you buy from so purchase orders can track them."
          action={
            canManage && (
              <Button onClick={() => navigate('/suppliers/new')}>
                <Plus className="size-4" /> Add your first supplier
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && suppliers && suppliers.length > 0 && filtered.length === 0 && (
        <FilteredEmptyState onClear={() => setSearch('')} />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(`/suppliers/${s.id}`)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                  <Truck className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-text-primary">{s.name}</p>
                    {!s.is_active && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                        Inactive
                      </span>
                    )}
                  </div>
                  {(s.phone || s.email) && (
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-text-muted">
                      {s.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {s.phone}
                        </span>
                      )}
                      {s.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3" />
                          {s.email}
                        </span>
                      )}
                    </div>
                  )}
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
