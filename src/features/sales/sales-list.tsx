import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { Pagination } from '@/components/data/pagination'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { useActiveBusiness } from '@/features/business/hooks'
import { businessDayStartUtc } from '@/lib/format'
import { useSalesList, useSalesTotals, type SalesListFilters } from '@/features/sales/use-sales-list'
import { SalesTable } from '@/features/sales/sales-table'

const PAGE_SIZE = 50

function dateInputValue(dayStart: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    dayStart,
  )
}

function useDayFilter(timeZone: string | undefined, dayOffset: number): SalesListFilters {
  return useMemo(() => {
    if (!timeZone) return { from: '', to: '' }
    const anchor = new Date(Date.now() + dayOffset * 86_400_000)
    const from = businessDayStartUtc(anchor, timeZone)
    const to = businessDayStartUtc(new Date(new Date(from).getTime() + 86_400_000), timeZone)
    return { from, to }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone, dayOffset])
}

export function SalesListPage() {
  const { business, role } = useActiveBusiness()
  const canSeeGrossProfit = role === 'owner' || role === 'manager'
  const [dayOffset, setDayOffset] = useState(0)
  const [page, setPage] = useState(1)

  const filters = useDayFilter(business?.timezone, dayOffset)
  const { data, isLoading, isError, refetch } = useSalesList(filters, page, PAGE_SIZE)
  const { data: totals } = useSalesTotals(filters)

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  function handleDateInput(value: string) {
    if (!business || !value) return
    const picked = new Date(`${value}T12:00:00Z`)
    const today = new Date()
    const msPerDay = 86_400_000
    const pickedDayStart = businessDayStartUtc(picked, business.timezone)
    const todayDayStart = businessDayStartUtc(today, business.timezone)
    setDayOffset(Math.round((new Date(pickedDayStart).getTime() - new Date(todayDayStart).getTime()) / msPerDay))
    setPage(1)
  }

  return (
    <div>
      <PageHeader title="Sales" description={dayOffset === 0 ? 'Today' : undefined} />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-6">
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous day"
              onClick={() => {
                setDayOffset((d) => d - 1)
                setPage(1)
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <label className="text-xs font-medium text-text-secondary">Date</label>
              <Input
                type="date"
                className="mt-1"
                value={business ? dateInputValue(new Date(filters.from), business.timezone) : ''}
                onChange={(e) => handleDateInput(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={dayOffset >= 0}
              onClick={() => {
                setDayOffset((d) => Math.min(0, d + 1))
                setPage(1)
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
            {dayOffset !== 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDayOffset(0)
                  setPage(1)
                }}
              >
                Today
              </Button>
            )}
          </div>

          {totals && (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-text-secondary">Sales</p>
                <p className="font-semibold text-text-primary">{totals.saleCount}</p>
              </div>
              <div>
                <p className="text-text-secondary">Units sold</p>
                <p className="font-semibold text-text-primary">
                  <Quantity value={totals.unitsSold} />
                </p>
              </div>
              <div>
                <p className="text-text-secondary">Revenue</p>
                <p className="font-semibold text-text-primary">
                  <Money value={totals.grandTotal} />
                </p>
              </div>
              {canSeeGrossProfit && (
                <div>
                  <p className="text-text-secondary">Gross profit</p>
                  <p className="font-semibold text-text-primary">
                    <Money value={totals.grossProfit} />
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton />}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.rows.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No sales for this day"
          description="Completed sales will appear here once you start selling."
        />
      )}

      {!isLoading && !isError && data && data.rows.length > 0 && (
        <>
          <SalesTable rows={data.rows} showGrossProfit={canSeeGrossProfit} />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={data.total} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  )
}
