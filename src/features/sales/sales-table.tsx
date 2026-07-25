import { useNavigate } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { SaleStatusBadge } from '@/features/sales/sale-status-badge'
import { formatDateTime } from '@/lib/format'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { cn } from '@/lib/utils'
import type { SaleSummaryRow } from '@/features/sales/use-sales-list'

export function SalesTable({ rows, showGrossProfit }: { rows: SaleSummaryRow[]; showGrossProfit: boolean }) {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const navigate = useNavigate()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sale #</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Total</TableHead>
          {showGrossProfit && <TableHead>Gross profit</TableHead>}
          <TableHead>Cashier</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const voided = row.status === 'voided'
          return (
            <TableRow
              key={row.id}
              className={cn('cursor-pointer', voided && 'opacity-60')}
              onClick={() => navigate(`/sales/${row.id}`)}
            >
              <TableCell className="font-medium text-text-primary">{row.sale_number}</TableCell>
              <TableCell className="whitespace-nowrap text-text-secondary">
                {business ? formatDateTime(row.completed_at, business.timezone, locale) : row.completed_at}
              </TableCell>
              <TableCell className="text-text-secondary">
                <Quantity value={row.unit_count} />
              </TableCell>
              <TableCell className="font-medium">
                <Money value={row.grand_total} />
              </TableCell>
              {showGrossProfit && (
                <TableCell className="text-text-secondary">
                  <Money value={row.gross_profit} />
                </TableCell>
              )}
              <TableCell className="text-text-secondary">{row.sold_by_name || '—'}</TableCell>
              <TableCell>
                <SaleStatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
