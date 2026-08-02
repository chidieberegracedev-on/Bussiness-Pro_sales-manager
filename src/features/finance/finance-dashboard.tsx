import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  Wallet,
  Banknote,
  Vault,
  PiggyBank,
  Truck,
  TrendingUp,
  Receipt,
  BookOpen,
  ArrowRight,
  Activity,
  DollarSign,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { ErrorState, PermissionDeniedState } from '@/components/data/error-state'
import { useFinancialPosition, useCashbook } from '@/features/finance/use-financial-position'
import { Term } from '@/features/help/term'
import { useActiveBusiness } from '@/features/business/hooks'
import { businessDayStartUtc } from '@/lib/format'
import { cn } from '@/lib/utils'

export function FinanceDashboardPage() {
  const navigate = useNavigate()
  const { business, role } = useActiveBusiness()
  const canSee = role === 'owner' || role === 'manager'

  const { data: position, isLoading, isError, refetch } = useFinancialPosition()

  // Today's P&L: pull revenue/cogs/expense events from cashbook (which excludes
  // P&L accounts by design), so we query the raw events via a separate hook.
  const monthStart = useMemo(() => {
    if (!business) return ''
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: business.timezone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date())
    const y = parts.find((p) => p.type === 'year')!.value
    const m = parts.find((p) => p.type === 'month')!.value
    return businessDayStartUtc(new Date(`${y}-${m}-01T12:00:00Z`), business.timezone)
  }, [business])

  const todayStart = useMemo(() => {
    if (!business) return ''
    return businessDayStartUtc(new Date(), business.timezone)
  }, [business])

  const { data: monthPnl, isLoading: pnlLoading } = usePnlSummary(monthStart, undefined)
  const { data: todayPnl } = usePnlSummary(todayStart, undefined)

  if (!canSee) return <PermissionDeniedState requiredRole="manager" />

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !position) {
    return <ErrorState error={new Error('load')} onRetry={() => refetch()} />
  }

  const availableCash = new Decimal(position.available_cash)
  const netProfitToday = todayPnl
    ? new Decimal(todayPnl.revenue).minus(todayPnl.cogs).minus(todayPnl.expenses)
    : new Decimal(0)
  const netProfitMonth = monthPnl
    ? new Decimal(monthPnl.revenue).minus(monthPnl.cogs).minus(monthPnl.expenses)
    : new Decimal(0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Every number here traces back to its events. Tap any card to see why."
        actions={
          <Button variant="outline" onClick={() => navigate('/finance/cashbook')}>
            <BookOpen className="size-4" /> Cashbook
          </Button>
        }
      />

      {/* Available cash headline */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-sm text-text-secondary">
              <Term slug="available-cash">Available cash</Term> across all accounts
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
              <Money value={availableCash} />
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Register + Bank + Safe + Petty − Supplier payable
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-secondary">
              <Term slug="net-profit">Net profit</Term> · this month
            </p>
            <p
              className={cn(
                'mt-1 text-2xl font-bold',
                netProfitMonth.gte(0) ? 'text-success' : 'text-danger',
              )}
            >
              <Money value={netProfitMonth} />
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Today:{' '}
              <span className={netProfitToday.gte(0) ? 'text-success' : 'text-danger'}>
                <Money value={netProfitToday} />
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 8-line control-centre panel */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          label="Register"
          value={position.cash}
          icon={Wallet}
          iconClass="text-accent-primary bg-accent-primary/10"
          onClick={() => navigate('/finance/cashbook?account=cash')}
        />
        <BalanceCard
          label="Bank"
          value={position.bank}
          icon={Banknote}
          iconClass="text-info bg-info/10"
          onClick={() => navigate('/finance/cashbook?account=bank')}
        />
        <BalanceCard
          label="Safe"
          value={position.safe}
          icon={Vault}
          iconClass="text-accent-secondary bg-accent-secondary/10"
          onClick={() => navigate('/finance/cashbook?account=safe')}
        />
        <BalanceCard
          label={<Term slug="petty-cash">Petty cash</Term>}
          value={position.petty_cash}
          icon={PiggyBank}
          iconClass="text-accent-tertiary bg-accent-tertiary/10"
          onClick={() => navigate('/finance/cashbook?account=petty_cash')}
        />

        <BalanceCard
          label={<Term slug="supplier-credit">Supplier payable</Term>}
          value={position.supplier_payable}
          icon={Truck}
          iconClass="text-warning bg-warning/10"
          onClick={() => navigate('/finance/cashbook')}
          negative
        />
        <BalanceCard
          label={<Term slug="revenue">Revenue</Term>}
          value={monthPnl?.revenue ?? '0'}
          icon={DollarSign}
          iconClass="text-success bg-success/10"
          onClick={() => navigate('/reports/sales')}
        />
        <BalanceCard
          label={<Term slug="expense">Expenses</Term>}
          value={monthPnl?.expenses ?? '0'}
          icon={Receipt}
          iconClass="text-danger bg-danger/10"
          onClick={() => navigate('/expenses')}
        />
        <BalanceCard
          label={<Term slug="net-profit">Net profit</Term>}
          value={netProfitMonth.toString()}
          icon={TrendingUp}
          iconClass={
            netProfitMonth.gte(0)
              ? 'text-success bg-success/10'
              : 'text-danger bg-danger/10'
          }
          onClick={() => navigate('/reports/sales')}
        />
      </div>

      {/* P&L breakdown */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">This month · P&amp;L breakdown</CardTitle>
          {pnlLoading && <Skeleton className="h-4 w-16" />}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <PnlLine
              label={<Term slug="revenue">Revenue</Term>}
              value={monthPnl?.revenue ?? '0'}
              accent="success"
            />
            <PnlLine
              label={<Term slug="cogs">Cost of goods sold</Term>}
              value={monthPnl?.cogs ?? '0'}
              negative
            />
            <PnlLine
              label={<Term slug="gross-profit">Gross profit</Term>}
              value={
                monthPnl ? new Decimal(monthPnl.revenue).minus(monthPnl.cogs).toString() : '0'
              }
              accent="accent"
            />
            <PnlLine
              label={<Term slug="expense">Expenses</Term>}
              value={monthPnl?.expenses ?? '0'}
              negative
            />
            <PnlLine
              label={<Term slug="net-profit">Net profit</Term>}
              value={netProfitMonth.toString()}
              accent={netProfitMonth.gte(0) ? 'success' : 'danger'}
              bold
            />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/finance/cashbook')}>
            View cashbook <ArrowRight className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <RecentActivityList />
        </CardContent>
      </Card>
    </div>
  )
}

function BalanceCard({
  label,
  value,
  icon: Icon,
  iconClass,
  onClick,
  negative,
}: {
  label: React.ReactNode
  value: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  onClick: () => void
  negative?: boolean
}) {
  const v = new Decimal(value)
  const displayValue = negative ? v.negated() : v
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-border-strong"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <div className={cn('flex size-9 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight text-text-primary">
        <Money value={displayValue} />
      </div>
    </button>
  )
}

function PnlLine({
  label,
  value,
  accent,
  negative,
  bold,
}: {
  label: React.ReactNode
  value: string
  accent?: 'success' | 'danger' | 'accent'
  negative?: boolean
  bold?: boolean
}) {
  const v = new Decimal(value)
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl tabular-nums',
          bold ? 'font-bold' : 'font-semibold',
          accent === 'success' && 'text-success',
          accent === 'danger' && 'text-danger',
          accent === 'accent' && 'text-text-primary',
          !accent && negative && 'text-danger',
          !accent && !negative && 'text-text-primary',
        )}
      >
        {negative ? '−' : ''}
        <Money value={v.abs()} />
      </p>
    </div>
  )
}

function RecentActivityList() {
  const { data: rows, isLoading } = useCashbook({})
  const navigate = useNavigate()

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!rows || rows.length === 0)
    return <p className="py-6 text-center text-sm text-text-muted">Nothing recorded yet.</p>

  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 6).map((row) => {
        const signed = new Decimal(row.signed_amount)
        const isInflow = signed.gt(0)
        return (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-text-muted" />
              <span className="text-sm text-text-primary">{row.note ?? row.event_type}</span>
            </div>
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                isInflow ? 'text-success' : 'text-danger',
              )}
            >
              {isInflow ? '+' : '−'}
              <Money value={signed.abs()} />
            </span>
          </li>
        )
      })}
      {rows.length > 6 && (
        <li className="pt-2 text-center">
          <button
            type="button"
            onClick={() => navigate('/finance/cashbook')}
            className="text-xs font-medium text-accent-primary hover:underline"
          >
            View all {rows.length} entries
          </button>
        </li>
      )}
    </ul>
  )
}

// P&L summary — sums revenue/cogs/expense events over a date range.
// Reads financial_events directly since v_cashbook excludes P&L accounts.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

function usePnlSummary(from: string, to: string | undefined) {
  const { business } = useActiveBusiness()

  return useQuery({
    queryKey: ['pnl-summary', business?.id, from, to],
    queryFn: async () => {
      let q = supabase
        .from('financial_events')
        .select('account, direction, amount')
        .eq('business_id', business!.id)
        .in('account', ['revenue', 'cogs', 'expense'])
      if (from) q = q.gte('occurred_at', from)
      if (to) q = q.lt('occurred_at', to)
      const { data, error } = await q
      if (error) throw error
      let revenue = new Decimal(0)
      let cogs = new Decimal(0)
      let expenses = new Decimal(0)
      for (const row of data ?? []) {
        const amt = new Decimal(row.amount)
        const signed = row.direction === 'credit' ? amt : amt.negated()
        // Revenue is credit → positive; COGS/expenses are debit → we want positive amounts here for display
        if (row.account === 'revenue') revenue = revenue.plus(signed)
        if (row.account === 'cogs') cogs = cogs.plus(amt)
        if (row.account === 'expense') expenses = expenses.plus(amt)
      }
      return {
        revenue: revenue.toString(),
        cogs: cogs.toString(),
        expenses: expenses.toString(),
      }
    },
    enabled: !!business && !!from,
    staleTime: 60_000,
  })
}
