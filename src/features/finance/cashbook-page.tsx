import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  BookOpen,
  ShoppingBag,
  Receipt,
  ArrowRightLeft,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Banknote,
  Vault,
  PiggyBank,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState, PermissionDeniedState } from '@/components/data/error-state'
import { Money } from '@/components/money/money'
import { useCashbook, type CashbookFilters } from '@/features/finance/use-financial-position'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime, businessDayStartUtc } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FinancialAccount, FinancialEventType } from '@/types/database'

const ACCOUNT_LABELS: Record<'cash' | 'bank' | 'safe' | 'petty_cash', string> = {
  cash: 'Register',
  bank: 'Bank',
  safe: 'Safe',
  petty_cash: 'Petty cash',
}
const ACCOUNT_ICONS = {
  cash: Wallet,
  bank: Banknote,
  safe: Vault,
  petty_cash: PiggyBank,
} as const

const EVENT_LABELS: Record<FinancialEventType, string> = {
  sale_revenue: 'Sale',
  sale_cogs: 'Cost of sale',
  cash_in: 'Cash sale',
  bank_in: 'Non-cash sale',
  expense: 'Expense',
  supplier_payable_add: 'Supplier credit',
  supplier_payment: 'Supplier payment',
  safe_drop_out: 'Moved to safe',
  safe_drop_in: 'From safe',
  petty_cash_out: 'Petty cash spend',
  petty_cash_fund: 'Fund petty cash',
  float_open: 'Opening float',
  drawer_variance: 'Drawer variance',
  adjustment: 'Adjustment',
}

export function CashbookPage() {
  const navigate = useNavigate()
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canSee = role === 'owner' || role === 'manager'
  const [searchParams] = useSearchParams()

  const [account, setAccount] = useState<FinancialAccount | 'all'>(
    (searchParams.get('account') as FinancialAccount) ?? 'all',
  )
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const range = business
    ? {
        from: fromDate ? businessDayStartUtc(new Date(`${fromDate}T12:00:00Z`), business.timezone) : '',
        to: toDate
          ? businessDayStartUtc(new Date(new Date(`${toDate}T12:00:00Z`).getTime() + 86_400_000), business.timezone)
          : '',
      }
    : { from: '', to: '' }

  const filters: CashbookFilters = { account, from: range.from, to: range.to }
  const { data: rows, isLoading, isError, refetch } = useCashbook(filters)

  if (!canSee) return <PermissionDeniedState requiredRole="manager" />

  function openReference(row: (typeof rows extends readonly (infer T)[] ? T : never) | { reference_type: string | null; reference_id: string | null }) {
    if (!row.reference_type || !row.reference_id) return
    if (row.reference_type === 'sale') navigate(`/sales/${row.reference_id}`)
    else if (row.reference_type === 'shift') navigate(`/shifts/${row.reference_id}/close`)
  }

  return (
    <div>
      <PageHeader
        title="Cashbook"
        description="Every inflow and outflow, in order. Tap a row to trace it back to its source."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="text-xs font-medium text-text-secondary">Account</label>
            <Select value={account} onValueChange={(v) => setAccount(v as FinancialAccount | 'all')}>
              <SelectTrigger className="mt-1 w-44" aria-label="Filter by account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                <SelectItem value="cash">Register</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="safe">Safe</SelectItem>
                <SelectItem value="petty_cash">Petty cash</SelectItem>
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
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-96 w-full rounded-xl" />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && (!rows || rows.length === 0) && (
        <EmptyState
          icon={BookOpen}
          title="No entries in the cashbook yet"
          description="Cash sales, expenses, and transfers will appear here as they happen."
        />
      )}

      {!isLoading && !isError && rows && rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((row) => {
            const signed = new Decimal(row.signed_amount)
            const isInflow = signed.gt(0)
            const Icon = ACCOUNT_ICONS[row.account as keyof typeof ACCOUNT_ICONS] ?? Wallet
            const canOpen = row.reference_type === 'sale' || row.reference_type === 'shift'
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openReference(row)}
                  disabled={!canOpen}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors',
                    canOpen && 'hover:bg-surface-muted',
                    !canOpen && 'cursor-default',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      isInflow ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                    )}
                  >
                    {isInflow ? (
                      <ArrowDownRight className="size-4" />
                    ) : row.event_type === 'safe_drop_out' || row.event_type === 'petty_cash_fund' ? (
                      <ArrowRightLeft className="size-4" />
                    ) : row.event_type === 'expense' ? (
                      <Receipt className="size-4" />
                    ) : row.event_type === 'supplier_payment' ? (
                      <ShoppingBag className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">
                        {EVENT_LABELS[row.event_type]}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                        <Icon className="size-3" />
                        {ACCOUNT_LABELS[row.account as keyof typeof ACCOUNT_LABELS] ?? row.account}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {business ? formatDateTime(row.occurred_at, business.timezone, locale) : row.occurred_at}
                      {row.note && ` · ${row.note}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        isInflow ? 'text-success' : 'text-danger',
                      )}
                    >
                      {isInflow ? '+' : '−'}
                      <Money value={signed.abs()} />
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
