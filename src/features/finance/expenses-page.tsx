import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Receipt, Plus, FolderTree, Wallet, Banknote, PiggyBank } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { useExpenses, type ExpenseFilters } from '@/features/finance/use-expenses'
import { useExpenseCategories } from '@/features/finance/use-expense-categories'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDate, businessDayStartUtc } from '@/lib/format'
import type { CashSource } from '@/types/database'
import { RecordExpenseDialog } from '@/features/finance/record-expense-dialog'

const SOURCE_LABELS: Record<CashSource, string> = { cash: 'Cash', bank: 'Bank', petty_cash: 'Petty cash' }
const SOURCE_ICONS = { cash: Wallet, bank: Banknote, petty_cash: PiggyBank } as const

export function ExpensesPage() {
  const navigate = useNavigate()
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canManage = role === 'owner' || role === 'manager'
  const [recordOpen, setRecordOpen] = useState(false)

  const [categoryId, setCategoryId] = useState<string>('all')
  const [paidFrom, setPaidFrom] = useState<CashSource | 'all'>('all')
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

  const filters: ExpenseFilters = { categoryId, paidFrom, from: range.from, to: range.to }
  const { data: categories } = useExpenseCategories(true)
  const { data: expenses, isLoading, isError, refetch } = useExpenses(filters)

  const totalToday = useMemo(() => {
    if (!expenses || !business) return new Decimal(0)
    const today = businessDayStartUtc(new Date(), business.timezone)
    return expenses
      .filter((e) => e.spent_at >= today)
      .reduce((sum, e) => sum.plus(e.amount), new Decimal(0))
  }, [expenses, business])

  const totalRange = useMemo(() => {
    if (!expenses) return new Decimal(0)
    return expenses.reduce((sum, e) => sum.plus(e.amount), new Decimal(0))
  }, [expenses])

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money going out — categorised, dated, drillable."
        actions={
          <div className="flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => navigate('/expenses/categories')}>
                <FolderTree className="size-4" /> Categories
              </Button>
            )}
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" /> Record expense
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-text-secondary">Today</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">
              <Money value={totalToday} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-text-secondary">In range shown</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">
              <Money value={totalRange} />
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="text-xs font-medium text-text-secondary">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1 w-48" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Paid from</label>
            <Select value={paidFrom} onValueChange={(v) => setPaidFrom(v as CashSource | 'all')}>
              <SelectTrigger className="mt-1 w-36" aria-label="Filter by source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(SOURCE_LABELS) as CashSource[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">From</label>
            <Input type="date" className="mt-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">To</label>
            <Input type="date" className="mt-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(categoryId !== 'all' || paidFrom !== 'all' || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryId('all')
                setPaidFrom('all')
                setFromDate('')
                setToDate('')
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && expenses && expenses.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Record your first expense to start tracking cash outflows."
          action={
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" /> Record expense
            </Button>
          }
        />
      )}

      {!isLoading && !isError && expenses && expenses.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Paid from</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => {
                    const Icon = SOURCE_ICONS[e.paid_from]
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm text-text-secondary">
                          {business ? formatDate(e.spent_at, business.timezone, locale) : e.spent_at}
                        </TableCell>
                        <TableCell className="text-text-primary">{e.category_name ?? 'Uncategorized'}</TableCell>
                        <TableCell className="text-text-secondary">{e.description ?? '—'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <Icon className="size-3.5" />
                            {SOURCE_LABELS[e.paid_from]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-text-muted">{e.recorded_by_name ?? '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-text-primary">
                          <Money value={e.amount} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <RecordExpenseDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  )
}
