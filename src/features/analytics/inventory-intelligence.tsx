import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Warehouse, AlertTriangle, History } from 'lucide-react'
import Decimal from 'decimal.js'
import { useInventoryValue, useInventoryByCategory } from '@/features/analytics/use-inventory-intelligence'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatMoney } from '@/lib/money'
import { StatCard } from '@/features/analytics/stat-card'
import { Term } from '@/features/help/term'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'

const CHART_COLORS = [
  'hsl(var(--accent-primary))',
  'hsl(var(--accent-secondary))',
  'hsl(var(--accent-tertiary))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--success))',
]

export function InventoryIntelligencePage() {
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const navigate = useNavigate()
  const canSeeValue = role === 'owner' || role === 'manager'

  const { data: inventoryValue, isLoading: loadingValue } = useInventoryValue()
  const { data: byCategory, isLoading: loadingCategory } = useInventoryByCategory()

  const chartData = useMemo(
    () =>
      (byCategory ?? []).map((c) => ({
        name: (c.category_name ?? 'Uncategorized').length > 16
          ? (c.category_name ?? 'Uncategorized').slice(0, 14) + '…'
          : (c.category_name ?? 'Uncategorized'),
        value: new Decimal(c.total_cost_value).toNumber(),
        units: new Decimal(c.total_units).toNumber(),
      })),
    [byCategory],
  )

  function fmtMoney(v: number) {
    if (!business) return String(v)
    return formatMoney(v, business.currency_code, business.currency_exponent, locale)
  }

  const isLoading = loadingValue || loadingCategory

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Inventory Intelligence</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Current-state inventory value and composition</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/inventory/movements')}>
          <History className="size-4" /> Movement history
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <Skeleton className="mb-3 h-4 w-20" />
                <Skeleton className="h-7 w-28" />
              </div>
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {canSeeValue && (
              <StatCard
                label={<Term slug="inventory-valuation">Total Inventory Value</Term>}
                value={inventoryValue ? <Money value={inventoryValue.total_cost_value} /> : '—'}
                icon={Warehouse}
                iconColor="text-accent-primary bg-accent-primary/10"
              />
            )}
            <StatCard
              label="Total Units"
              value={inventoryValue ? <Quantity value={inventoryValue.total_units} /> : '0'}
              icon={Warehouse}
              iconColor="text-info bg-info/10"
            />
            {inventoryValue && new Decimal(inventoryValue.negative_variant_count).gt(0) && (
              <StatCard
                label="Negative Stock"
                value={`${inventoryValue.negative_variant_count} variant${new Decimal(inventoryValue.negative_variant_count).eq(1) ? '' : 's'}`}
                icon={AlertTriangle}
                iconColor="text-danger bg-danger/10"
              />
            )}
          </div>

          {/* Composition by category */}
          {canSeeValue && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Value by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={fmtMoney}
                            tick={{ fontSize: 12, fill: 'hsl(var(--text-muted))' }}
                            axisLine={false}
                            tickLine={false}
                            width={80}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--surface-elevated))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '0.5rem',
                              fontSize: '0.8125rem',
                            }}
                            formatter={(value) => [fmtMoney(Number(value)), 'Value']}
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={36}>
                            {chartData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Warehouse}
                      title="No inventory data"
                      description="Add products and stock to see value distribution."
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Category Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {(byCategory ?? []).length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Variants</TableHead>
                          <TableHead>Units</TableHead>
                          <TableHead>Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(byCategory ?? []).map((c) => (
                          <TableRow key={c.category_id ?? 'uncategorized'}>
                            <TableCell className="font-medium text-text-primary">
                              {c.category_name ?? 'Uncategorized'}
                            </TableCell>
                            <TableCell className="text-text-secondary">{c.variant_count}</TableCell>
                            <TableCell><Quantity value={c.total_units} /></TableCell>
                            <TableCell><Money value={c.total_cost_value} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-8 text-center text-sm text-text-muted">No categories yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
