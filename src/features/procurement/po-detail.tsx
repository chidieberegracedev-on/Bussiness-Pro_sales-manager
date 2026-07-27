import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  PackageCheck,
  Copy,
  Download,
  Truck,
  Clock,
  User,
  MapPin,
  FileText,
} from 'lucide-react'
import Decimal from 'decimal.js'
import { usePurchaseOrderDetail } from '@/features/procurement/use-purchase-orders'
import { PoStatusBadge, PoItemStatusBadge } from '@/features/procurement/po-status-badge'
import { generatePoText, downloadPoPdf } from '@/features/procurement/po-document'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { ErrorState } from '@/components/data/error-state'
import { toast } from '@/hooks/use-toast'
import { formatMoney } from '@/lib/money'

export function PurchaseOrderDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { business, role } = useActiveBusiness()
  const locale = useLocale()
  const canReceive = role === 'owner' || role === 'manager' || role === 'cashier'

  const { data, isLoading, isError, refetch } = usePurchaseOrderDetail(id)
  const [copying, setCopying] = useState(false)

  const outstanding = useMemo(() => {
    if (!data) return { count: 0, totalBase: '0' }
    let count = 0
    let total = new Decimal(0)
    for (const item of data.items) {
      if (item.status !== 'complete') {
        count++
        const ordered = new Decimal(item.qty_ordered_purchase).times(item.conversion_to_base)
        total = total.plus(ordered.minus(item.qty_received_base))
      }
    }
    return { count, totalBase: total.toString() }
  }, [data])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !data) {
    return <ErrorState error={new Error('Purchase order not found')} onRetry={() => refetch()} />
  }

  const { order, items, receipts } = data
  const canReceiveHere =
    canReceive && (order.status === 'ordered' || order.status === 'partially_received' || order.status === 'draft')

  async function copyAsText() {
    if (!business) return
    try {
      const text = generatePoText({ order, items, business, locale })
      await navigator.clipboard.writeText(text)
      setCopying(true)
      toast({ title: 'PO copied to clipboard' })
      setTimeout(() => setCopying(false), 2000)
    } catch {
      toast({ variant: 'destructive', title: "Couldn't copy" })
    }
  }

  async function downloadPdf() {
    if (!business) return
    try {
      await downloadPoPdf({ order, items, business, locale })
    } catch {
      toast({ variant: 'destructive', title: "Couldn't generate PDF" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-orders')}>
          <ArrowLeft className="size-4" /> All POs
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyAsText}>
            <Copy className="size-4" /> {copying ? 'Copied!' : 'Copy as text'}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download className="size-4" /> Download PDF
          </Button>
          {canReceiveHere && (
            <Button size="sm" onClick={() => navigate(`/purchase-orders/${order.id}/receive`)}>
              <PackageCheck className="size-4" /> Receive goods
            </Button>
          )}
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-accent-primary/10 text-sm font-bold text-accent-primary">
                  #{order.po_number}
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-text-primary">
                    Purchase Order · {order.supplier_name}
                  </h1>
                  <PoStatusBadge status={order.status} className="mt-1" />
                </div>
              </div>
              {order.note && (
                <p className="mt-3 max-w-lg whitespace-pre-wrap text-sm text-text-secondary">{order.note}</p>
              )}
            </div>

            <div className="text-right">
              <p className="text-xs text-text-muted">Estimated total</p>
              <p className="text-2xl font-bold text-text-primary">
                <Money value={order.expected_total} />
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <MetaItem icon={Truck} label="Supplier" value={order.supplier_name} />
            <MetaItem icon={MapPin} label="Location" value={order.location_name} />
            <MetaItem
              icon={Clock}
              label={order.ordered_at ? 'Ordered' : 'Created'}
              value={
                business
                  ? formatDateTime(order.ordered_at ?? order.created_at, business.timezone, locale)
                  : (order.ordered_at ?? order.created_at)
              }
            />
            <MetaItem icon={User} label="Created by" value={order.created_by_name ?? 'Unknown'} />
          </div>
        </CardContent>
      </Card>

      {outstanding.count > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <PackageCheck className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                {outstanding.count} line{outstanding.count === 1 ? '' : 's'} outstanding
              </p>
              <p className="text-xs text-text-muted">
                <Quantity value={outstanding.totalBase} /> base units still to receive.
              </p>
            </div>
            {canReceiveHere && (
              <Button size="sm" onClick={() => navigate(`/purchase-orders/${order.id}/receive`)}>
                Receive next delivery
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Received (base)</TableHead>
                  <TableHead>Expected cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const orderedBase = new Decimal(item.qty_ordered_purchase).times(item.conversion_to_base)
                  const remainingBase = orderedBase.minus(item.qty_received_base)
                  const lineTotal = new Decimal(item.qty_ordered_purchase).times(item.expected_unit_cost)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium text-text-primary">{item.product_name}</p>
                        <p className="text-xs text-text-muted">
                          1 {item.purchase_unit} = {new Decimal(item.conversion_to_base).toString()} base units
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>
                          <Quantity value={item.qty_ordered_purchase} /> {item.purchase_unit}
                        </p>
                        <p className="text-xs text-text-muted">
                          = <Quantity value={orderedBase.toString()} /> base
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>
                          <Quantity value={item.qty_received_base} />
                        </p>
                        {remainingBase.gt(0) && (
                          <p className="text-xs text-warning">
                            <Quantity value={remainingBase.toString()} /> remaining
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p>
                          <Money value={item.expected_unit_cost} />/{item.purchase_unit}
                        </p>
                        <p className="text-xs text-text-muted">
                          line: <Money value={lineTotal.toFixed(4)} />
                        </p>
                      </TableCell>
                      <TableCell>
                        <PoItemStatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Receipt history */}
      {receipts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Receiving history ({receipts.length} receipt{receipts.length === 1 ? '' : 's'})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {receipts.map((receipt) => {
              const value = receipt.items.reduce(
                (sum, i) => sum.plus(new Decimal(i.qty_good_base).times(i.unit_cost_base)),
                new Decimal(0),
              )
              return (
                <div key={receipt.id} className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-muted/40 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        Received{' '}
                        {business ? formatDateTime(receipt.received_at, business.timezone, locale) : receipt.received_at}
                      </p>
                      <p className="text-xs text-text-muted">
                        {receipt.received_by_name ? `by ${receipt.received_by_name}` : 'by system'}
                        {receipt.note && ` · ${receipt.note}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary">
                        Value:{' '}
                        {business
                          ? formatMoney(value.toFixed(4), business.currency_code, business.currency_exponent, locale)
                          : value.toString()}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                          <th className="px-4 py-2 font-medium">Received</th>
                          <th className="px-4 py-2 font-medium">Good (base)</th>
                          <th className="px-4 py-2 font-medium">Damaged</th>
                          <th className="px-4 py-2 font-medium">Per-purchase cost</th>
                          <th className="px-4 py-2 font-medium">Per-base cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.items.map((ri) => {
                          const poi = items.find((i) => i.id === ri.po_item_id)
                          return (
                            <tr key={ri.id} className="border-t border-border-subtle">
                              <td className="px-4 py-2">
                                <p className="font-medium text-text-primary">{poi?.product_name ?? '—'}</p>
                                <p className="text-xs text-text-muted">
                                  <Quantity value={ri.qty_received_purchase} />{' '}
                                  {poi?.purchase_unit}
                                </p>
                              </td>
                              <td className="px-4 py-2 text-text-primary">
                                <Quantity value={ri.qty_good_base} />
                              </td>
                              <td className="px-4 py-2 text-text-secondary">
                                {new Decimal(ri.qty_damaged_base).gt(0) || new Decimal(ri.qty_discrepancy_base).gt(0) ? (
                                  <span className="text-warning">
                                    <Quantity value={new Decimal(ri.qty_damaged_base).plus(ri.qty_discrepancy_base).toString()} />
                                    <span className="ml-1 text-xs">({ri.discrepancy_reason})</span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-2 text-text-secondary">
                                <Money value={ri.unit_cost_purchase} />
                              </td>
                              <td className="px-4 py-2 font-medium text-text-primary">
                                <Money value={ri.unit_cost_base} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {receipts.length === 0 && order.status !== 'draft' && order.status !== 'cancelled' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-text-muted">
              <FileText className="size-5" />
            </div>
            <p className="text-sm font-medium text-text-primary">Nothing has been received yet</p>
            {canReceiveHere && (
              <Button size="sm" onClick={() => navigate(`/purchase-orders/${order.id}/receive`)}>
                <PackageCheck className="size-4" /> Record first receipt
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 text-text-muted" />
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-medium text-text-primary">{value}</p>
      </div>
    </div>
  )
}
