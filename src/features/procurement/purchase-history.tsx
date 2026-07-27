import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Decimal from 'decimal.js'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import {
  usePurchaseHistory,
  type PurchaseHistoryRow,
  type HistoryFilters,
} from '@/features/procurement/use-purchase-history'
import { useSuppliers } from '@/features/procurement/use-suppliers'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDate, businessDayStartUtc } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PurchaseHistoryPage() {
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const [supplierId, setSupplierId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const range = useMemo(() => {
    if (!business) return { from: '', to: '' }
    return {
      from: fromDate ? businessDayStartUtc(new Date(`${fromDate}T12:00:00Z`), business.timezone) : '',
      to: toDate
        ? businessDayStartUtc(new Date(new Date(`${toDate}T12:00:00Z`).getTime() + 86_400_000), business.timezone)
        : '',
    }
  }, [fromDate, toDate, business])

  const filters: HistoryFilters = {
    supplierId,
    variantId: 'all',
    from: range.from,
    to: range.to,
  }

  const { data: suppliers } = useSuppliers(true)
  const { data: rows, isLoading, isError, refetch } = usePurchaseHistory(filters)

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.product_name.toLowerCase().includes(q))
  }, [rows, search])

  const groupedByVariant = useMemo(() => {
    const map = new Map<string, PurchaseHistoryRow[]>()
    for (const row of filtered) {
      const list = map.get(row.variant_id) ?? []
      list.push(row)
      map.set(row.variant_id, list)
    }
    return Array.from(map.entries())
      .map(([variantId, receipts]) => ({
        variantId,
        productName: receipts[0].product_name,
        receipts: receipts.sort((a, b) => (a.received_at < b.received_at ? 1 : -1)),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName))
  }, [filtered])

  return (
    <div>
      <PageHeader
        title="Purchase History"
        description="What you received, when, from whom, and how the per-unit cost changed."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-text-secondary">Search product</label>
            <Input
              className="mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product name…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Supplier</label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="mt-1 w-52" aria-label="Filter by supplier">
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
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">From</label>
            <Input
              type="date"
              className="mt-1"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">To</label>
            <Input type="date" className="mt-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(fromDate || toDate || supplierId !== 'all' || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate('')
                setToDate('')
                setSupplierId('all')
                setSearch('')
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          icon={History}
          title="No purchase history"
          description="Once you receive goods against POs, the history and price trends appear here."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-4">
          {groupedByVariant.map((group) => (
            <Card key={group.variantId}>
              <CardHeader>
                <CardTitle className="text-base">{group.productName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead>Received (base)</TableHead>
                        <TableHead>Per purchase</TableHead>
                        <TableHead>Per base</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.receipts.map((row, i) => {
                        const prev = group.receipts[i + 1]
                        const change =
                          prev
                            ? new Decimal(row.unit_cost_base).minus(prev.unit_cost_base).toNumber()
                            : 0
                        return (
                          <TableRow key={`${row.po_id}-${row.received_at}-${row.variant_id}-${i}`}>
                            <TableCell className="text-sm text-text-secondary">
                              {business
                                ? formatDate(row.received_at, business.timezone, locale)
                                : row.received_at}
                            </TableCell>
                            <TableCell className="text-text-primary">{row.supplier_name}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="text-sm font-medium text-accent-primary hover:underline"
                                onClick={() => navigate(`/purchase-orders/${row.po_id}`)}
                              >
                                #{row.po_number}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Quantity value={row.qty_good_base} />
                            </TableCell>
                            <TableCell className="text-text-secondary">
                              <Money value={row.unit_cost_purchase} />/{row.purchase_unit}
                            </TableCell>
                            <TableCell className="font-medium text-text-primary">
                              <Money value={row.unit_cost_base} />
                            </TableCell>
                            <TableCell>
                              {prev ? (
                                <ChangeBadge diff={change} />
                              ) : (
                                <span className="text-xs text-text-muted">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-text-secondary">
                              <Money value={row.line_value} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
        <Minus className="size-3" /> 0
      </span>
    )
  }
  const up = diff > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        up ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success',
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? '+' : ''}
      <Money value={diff.toFixed(4)} />
    </span>
  )
}
