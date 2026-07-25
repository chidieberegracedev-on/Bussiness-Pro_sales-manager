import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Loader2 } from 'lucide-react'
import { useSaleDetail, useVoidSale } from '@/features/sales/use-sale-detail'
import { SaleStatusBadge } from '@/features/sales/sale-status-badge'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toReadableError } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { DetailSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  other: 'Other',
}

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canManage = role === 'owner' || role === 'manager'

  const { data, isLoading, isError, refetch } = useSaleDetail(id)
  const voidSale = useVoidSale()
  const [confirmingVoid, setConfirmingVoid] = useState(false)

  if (isLoading) return <DetailSkeleton />
  if (isError || !data) return <ErrorState error={new Error('load')} onRetry={() => refetch()} />

  const { sale, items, payments } = data

  async function handleVoid() {
    try {
      await voidSale.mutateAsync({ saleId: sale.id })
      toast({ title: `Sale #${sale.sale_number} voided`, description: 'Stock has been returned to inventory.' })
      setConfirmingVoid(false)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't void sale", description: toReadableError(error) })
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/sales')} className="-ml-2">
        <ArrowLeft className="size-4" /> Back to sales
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">Sale #{sale.sale_number}</h1>
            <SaleStatusBadge status={sale.status} />
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {business ? formatDateTime(sale.completed_at, business.timezone, locale) : sale.completed_at}
            {sale.sold_by_name && ` · ${sale.sold_by_name}`}
          </p>
        </div>

        {canManage && sale.status === 'completed' && (
          <Button variant="destructive" onClick={() => setConfirmingVoid(true)}>
            <Ban className="size-4" /> Void sale
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                {canManage && <TableHead>Unit cost</TableHead>}
                <TableHead>Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium text-text-primary">{item.product_name}</p>
                    {item.variant_name && <p className="text-xs text-text-muted">{item.variant_name}</p>}
                    {item.sku && <p className="text-xs text-text-muted">SKU: {item.sku}</p>}
                  </TableCell>
                  <TableCell><Quantity value={item.quantity} /></TableCell>
                  <TableCell><Money value={item.unit_price} /></TableCell>
                  {canManage && <TableCell className="text-text-secondary"><Money value={item.unit_cost} /></TableCell>}
                  <TableCell className="font-medium"><Money value={item.line_total} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Subtotal</span>
              <Money value={sale.subtotal} />
            </div>
            <div className="flex justify-between text-base font-semibold text-text-primary">
              <span>Total</span>
              <Money value={sale.grand_total} />
            </div>
            {canManage && (
              <div className="flex justify-between text-text-secondary">
                <span>Gross profit</span>
                <Money value={sale.gross_profit} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-sm">
                <span className="text-text-secondary">{METHOD_LABELS[p.method] ?? p.method}</span>
                <Money value={p.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {sale.status === 'voided' && sale.voided_at && (
        <p className="text-sm text-text-muted">
          Voided {business ? formatDateTime(sale.voided_at, business.timezone, locale) : sale.voided_at}
        </p>
      )}

      <AlertDialog open={confirmingVoid} onOpenChange={setConfirmingVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void sale #{sale.sale_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the stock movements from this sale and return the items to inventory. The sale record
              is kept for audit history but excluded from revenue and profit totals. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voidSale.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} disabled={voidSale.isPending}>
              {voidSale.isPending && <Loader2 className="size-4 animate-spin" />}
              Void sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
