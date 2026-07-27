import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  Package,
  Plus,
  Star,
  Trash2,
  Archive,
  ArchiveRestore,
  Search,
  X,
  Loader2,
  FileText,
} from 'lucide-react'
import Decimal from 'decimal.js'
import {
  useSupplier,
  useSupplierLinks,
  useCreateLink,
  useUpdateLink,
  useDeleteLink,
  useUpdateSupplier,
} from '@/features/procurement/use-suppliers'
import { useVariantsForPicker } from '@/features/procurement/use-variants'
import { useActiveBusiness } from '@/features/business/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

export function SupplierDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { role } = useActiveBusiness()
  const canManage = role === 'owner' || role === 'manager'

  const { data: supplier, isLoading, isError, refetch } = useSupplier(id)
  const { data: links, isLoading: linksLoading } = useSupplierLinks(id)
  const updateSupplier = useUpdateSupplier()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const editingLink = useMemo(
    () => links?.find((l) => l.id === editingId) ?? null,
    [links, editingId],
  )
  const deletingLink = useMemo(
    () => links?.find((l) => l.id === deletingId) ?? null,
    [links, deletingId],
  )
  const deleteLink = useDeleteLink()

  async function toggleActive() {
    if (!supplier) return
    try {
      await updateSupplier.mutateAsync({ id: supplier.id, is_active: !supplier.is_active })
      toast({ title: supplier.is_active ? 'Supplier deactivated' : 'Supplier reactivated' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't update supplier",
        description: toReadableError(error),
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (isError || !supplier) {
    return <ErrorState error={new Error('Supplier not found')} onRetry={() => refetch()} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/suppliers')}>
          <ArrowLeft className="size-4" /> All suppliers
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)}>
              <Edit className="size-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={toggleActive} disabled={updateSupplier.isPending}>
              {supplier.is_active ? (
                <>
                  <Archive className="size-4" /> Deactivate
                </>
              ) : (
                <>
                  <ArchiveRestore className="size-4" /> Reactivate
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => navigate(`/purchase-orders/new?supplier=${supplier.id}`)}>
              <FileText className="size-4" /> Create PO
            </Button>
          </div>
        )}
      </div>

      {/* Identity */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
              <Package className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">{supplier.name}</h1>
                {!supplier.is_active && (
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">Inactive</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-text-secondary">
                {supplier.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-4 text-text-muted" />
                    {supplier.phone}
                  </span>
                )}
                {supplier.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-4 text-text-muted" />
                    {supplier.email}
                  </span>
                )}
                {supplier.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-text-muted" />
                    {supplier.address}
                  </span>
                )}
              </div>
              {supplier.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{supplier.notes}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked products */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Linked products</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="size-4" /> Link product
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {linksLoading && <Skeleton className="h-32 w-full" />}
          {!linksLoading && (!links || links.length === 0) && (
            <EmptyState
              icon={Package}
              title="No linked products"
              description="Link the products this supplier sells you, with the pack size (e.g. carton of 12 packs). This gives every PO the right conversion so a carton at 12,000 records as 1,000 per pack — no currency guessing."
              action={
                canManage && (
                  <Button size="sm" onClick={() => setPickerOpen(true)}>
                    <Plus className="size-4" /> Link a product
                  </Button>
                )
              }
            />
          )}
          {!linksLoading && links && links.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Supplier SKU</th>
                    <th className="py-2 pr-3 font-medium">Purchase unit</th>
                    <th className="py-2 pr-3 font-medium">Conversion</th>
                    <th className="py-2 pr-3 font-medium">Last cost</th>
                    <th className="py-2 pr-3 font-medium">Preferred</th>
                    {canManage && <th className="py-2 pr-0 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-text-primary">{link.product_name}</p>
                        {link.variant_name && (
                          <p className="text-xs text-text-muted">{link.variant_name}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-text-secondary">{link.supplier_sku ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-text-secondary">{link.purchase_unit}</td>
                      <td className="py-2.5 pr-3 text-text-secondary">
                        1 {link.purchase_unit} ={' '}
                        <span className="font-medium text-text-primary">
                          <Quantity value={link.conversion_to_base} /> {link.base_unit}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-text-secondary">
                        {link.last_purchase_cost ? <Money value={link.last_purchase_cost} /> : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        {link.is_preferred ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                            <Star className="size-3 fill-current" /> Preferred
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2.5 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEditingId(link.id)} aria-label="Edit link">
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingId(link.id)}
                            aria-label="Remove link"
                          >
                            <Trash2 className="size-4 text-danger" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pickerOpen && supplier && (
        <LinkPickerDialog supplierId={supplier.id} onClose={() => setPickerOpen(false)} />
      )}

      {editingLink && (
        <EditLinkDialog
          link={editingLink}
          onClose={() => setEditingId(null)}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing the link doesn't affect past purchase orders. Future POs to this supplier for this product will
              fall back to the product-level unit settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingLink) return
                try {
                  await deleteLink.mutateAsync({
                    id: deletingLink.id,
                    supplierId: deletingLink.supplier_id,
                    variantId: deletingLink.variant_id,
                  })
                  toast({ title: 'Link removed' })
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: "Couldn't remove link",
                    description: toReadableError(error),
                  })
                } finally {
                  setDeletingId(null)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function LinkPickerDialog({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 200)
  const { data: variants, isLoading } = useVariantsForPicker(debounced)
  const [selected, setSelected] = useState<{
    variantId: string
    productName: string
    variantName: string | null
    baseUnit: string
  } | null>(null)

  if (selected) {
    return (
      <NewLinkForm
        supplierId={supplierId}
        variantId={selected.variantId}
        productName={selected.productName}
        variantName={selected.variantName}
        baseUnit={selected.baseUnit}
        onBack={() => setSelected(null)}
        onDone={onClose}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a product to link</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-text-muted">Loading…</div>
            ) : !variants || variants.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-muted">No products match.</div>
            ) : (
              <ul className="divide-y divide-border">
                {variants.map((v) => (
                  <li key={v.variant_id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted"
                      onClick={() =>
                        setSelected({
                          variantId: v.variant_id,
                          productName: v.product_name,
                          variantName: v.variant_name,
                          baseUnit: v.base_unit,
                        })
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{v.product_name}</p>
                        {v.variant_name && <p className="truncate text-xs text-text-muted">{v.variant_name}</p>}
                      </div>
                      <span className="text-xs text-text-muted">
                        Sold in <span className="font-medium">{v.base_unit}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="size-4" /> Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewLinkForm({
  supplierId,
  variantId,
  productName,
  variantName,
  baseUnit,
  onBack,
  onDone,
}: {
  supplierId: string
  variantId: string
  productName: string
  variantName: string | null
  baseUnit: string
  onBack: () => void
  onDone: () => void
}) {
  const [purchaseUnit, setPurchaseUnit] = useState('carton')
  const [conversion, setConversion] = useState('')
  const [sku, setSku] = useState('')
  const [cost, setCost] = useState('')
  const [preferred, setPreferred] = useState(false)
  const createLink = useCreateLink()

  const conv = Number(conversion || '0')
  const previewValid = conv > 0

  async function submit() {
    if (!purchaseUnit.trim() || !previewValid) return
    try {
      await createLink.mutateAsync({
        variantId,
        supplierId,
        supplierSku: sku || null,
        purchaseUnit: purchaseUnit.trim(),
        conversionToBase: String(conv),
        lastPurchaseCost: cost || null,
        isPreferred: preferred,
      })
      toast({ title: 'Product linked' })
      onDone()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't link product",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link {productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
            <p className="font-medium text-text-primary">{productName}</p>
            {variantName && <p className="text-xs text-text-muted">{variantName}</p>}
            <p className="mt-1 text-xs text-text-muted">
              Stocked & sold in <span className="font-medium text-text-secondary">{baseUnit}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-text-secondary">Purchase unit</label>
              <Input
                className="mt-1"
                value={purchaseUnit}
                onChange={(e) => setPurchaseUnit(e.target.value)}
                placeholder="carton"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Conversion</label>
              <Input
                className="mt-1"
                value={conversion}
                onChange={(e) => setConversion(e.target.value)}
                placeholder="12"
                inputMode="decimal"
              />
              <p className="mt-1 text-xs text-text-muted">
                {baseUnit}s per {purchaseUnit || 'purchase unit'}
              </p>
            </div>
          </div>

          {previewValid && (
            <div className="rounded-md border border-accent-primary/30 bg-accent-primary/5 px-3 py-2 text-sm text-text-secondary">
              1 <span className="font-medium">{purchaseUnit}</span> ={' '}
              <span className="font-medium text-accent-primary">
                <Quantity value={String(conv)} /> {baseUnit}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-text-secondary">Supplier SKU (optional)</label>
              <Input className="mt-1" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">
                Last cost per {purchaseUnit || 'unit'} (optional)
              </label>
              <Input
                className="mt-1"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={preferred}
              onChange={(e) => setPreferred(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Preferred supplier for this product
            <span className="text-xs text-text-muted">(replaces existing preferred)</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button onClick={submit} disabled={createLink.isPending || !previewValid || !purchaseUnit.trim()}>
            {createLink.isPending && <Loader2 className="size-4 animate-spin" />}
            Link product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditLinkDialog({
  link,
  onClose,
}: {
  link: {
    id: string
    variant_id: string
    supplier_id: string
    product_name: string
    variant_name: string | null
    base_unit: string
    purchase_unit: string
    conversion_to_base: string
    supplier_sku: string | null
    last_purchase_cost: string | null
    is_preferred: boolean
  }
  onClose: () => void
}) {
  const [purchaseUnit, setPurchaseUnit] = useState(link.purchase_unit)
  const [conversion, setConversion] = useState(String(new Decimal(link.conversion_to_base)))
  const [sku, setSku] = useState(link.supplier_sku ?? '')
  const [cost, setCost] = useState(link.last_purchase_cost ?? '')
  const [preferred, setPreferred] = useState(link.is_preferred)
  const updateLink = useUpdateLink()

  const conv = Number(conversion || '0')

  async function submit() {
    if (!purchaseUnit.trim() || conv <= 0) return
    try {
      await updateLink.mutateAsync({
        id: link.id,
        supplierId: link.supplier_id,
        variantId: link.variant_id,
        supplierSku: sku || null,
        purchaseUnit: purchaseUnit.trim(),
        conversionToBase: String(conv),
        lastPurchaseCost: cost || null,
        isPreferred: preferred,
      })
      toast({ title: 'Link updated' })
      onClose()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't update link",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit link · {link.product_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-text-secondary">Purchase unit</label>
              <Input className="mt-1" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Conversion</label>
              <Input
                className="mt-1"
                value={conversion}
                onChange={(e) => setConversion(e.target.value)}
                inputMode="decimal"
              />
              <p className="mt-1 text-xs text-text-muted">
                {link.base_unit}s per {purchaseUnit || 'purchase unit'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-text-secondary">Supplier SKU</label>
              <Input className="mt-1" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Last cost</label>
              <Input className="mt-1" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={preferred}
              onChange={(e) => setPreferred(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Preferred supplier for this product
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={updateLink.isPending || conv <= 0 || !purchaseUnit.trim()}>
            {updateLink.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
