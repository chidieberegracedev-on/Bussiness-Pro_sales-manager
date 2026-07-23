import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { MovementTypeBadge } from '@/features/inventory/movement-type-badge'
import { formatDateTime } from '@/lib/format'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { cn } from '@/lib/utils'
import type { MovementRow } from '@/features/inventory/use-movements'

export function MovementsTable({ rows, showProduct = false }: { rows: MovementRow[]; showProduct?: boolean }) {
  const { business } = useActiveBusiness()
  const locale = useLocale()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showProduct && <TableHead>Item</TableHead>}
          <TableHead>Type</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Note</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const qty = Number(row.quantity)
          const label = row.variant
            ? [row.variant.product?.name, row.variant.variant_name || row.variant.option_values.join(' / ')]
                .filter(Boolean)
                .join(' — ')
            : '—'
          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-text-secondary">
                {business ? formatDateTime(row.created_at, business.timezone, locale) : row.created_at}
              </TableCell>
              {showProduct && <TableCell className="text-text-primary">{label}</TableCell>}
              <TableCell><MovementTypeBadge type={row.movement_type} /></TableCell>
              <TableCell className={cn('tabular-nums font-medium', qty > 0 ? 'text-success' : 'text-danger')}>
                {qty > 0 ? '+' : ''}
                <Quantity value={row.quantity} />
              </TableCell>
              <TableCell><Quantity value={row.qty_after} /></TableCell>
              <TableCell><Money value={row.unit_cost} /></TableCell>
              <TableCell className="text-text-secondary">{row.created_by_profile?.full_name || '—'}</TableCell>
              <TableCell className="max-w-48 truncate text-text-secondary">{row.note || '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
