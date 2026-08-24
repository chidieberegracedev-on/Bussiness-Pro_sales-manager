import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { useProductDetail } from '@/features/products/use-product-detail'
import { useHasMovements, useUpdateProduct, useUpdateVariant } from '@/features/products/use-product-mutations'
import { CategoryField } from '@/features/products/category-field'
import { variantLabel } from '@/features/products/types'
import { uploadBusinessScopedImage, toUploadErrorMessage } from '@/lib/image-upload'
import { useSignedImageUrl } from '@/hooks/use-signed-image-url'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useActiveBusiness } from '@/features/business/hooks'
import { toReadableError } from '@/lib/errors'
import { formatMoneyForInput } from '@/lib/money'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UnitSelect } from '@/components/quantity/unit-select'
import { QuantityInput } from '@/components/quantity/quantity-input'
import { MoneyInput } from '@/components/money/money-input'
import { ImageUpload } from '@/components/data/image-upload'
import { DetailSkeleton } from '@/components/data/loading-state'
import { ErrorState } from '@/components/data/error-state'
import { OfflineNotice } from '@/components/data/offline-notice'
import { toast } from '@/hooks/use-toast'
import { useOnlineStatus } from '@/hooks/use-online-status'

interface EditFormValues {
  name: string
  description: string
  categoryId: string
  baseUnit: string
  hasPurchaseUnit: boolean
  purchaseUnit: string
  purchaseConversionQty: string
  variants: { id: string; label: string; sku: string; barcode: string; sellingPrice: string; lowStockThreshold: string }[]
}

export function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { business } = useActiveBusiness()
  const { product, variants, isLoading, isError, refetch } = useProductDetail(id)
  const variantIds = variants?.map((v) => v.variant_id)
  const { data: hasMovements } = useHasMovements(variantIds)
  const updateProduct = useUpdateProduct()
  const updateVariant = useUpdateVariant()

  const [imagePath, setImagePath] = useState<string | null | undefined>(undefined)
  const [imageUploading, setImageUploading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const online = useOnlineStatus()
  const { data: imagePreviewUrl } = useSignedImageUrl(PRODUCT_IMAGE_BUCKET, imagePath)

  const form = useForm<EditFormValues>({
    defaultValues: {
      name: '',
      description: '',
      categoryId: '',
      baseUnit: 'piece',
      hasPurchaseUnit: false,
      purchaseUnit: '',
      purchaseConversionQty: '',
      variants: [],
    },
  })
  const { fields } = useFieldArray({ control: form.control, name: 'variants' })

  useEffect(() => {
    if (product && variants) {
      form.reset({
        name: product.name,
        description: product.description ?? '',
        categoryId: product.category_id ?? '',
        baseUnit: product.base_unit,
        hasPurchaseUnit: !!product.purchase_unit,
        purchaseUnit: product.purchase_unit ?? '',
        purchaseConversionQty: product.purchase_conversion_qty ?? '',
        variants: variants.map((v) => ({
          id: v.variant_id,
          label: variantLabel(v),
          sku: v.sku ?? '',
          barcode: v.barcode ?? '',
          sellingPrice: business
            ? formatMoneyForInput(v.selling_price, business.currency_exponent)
            : v.selling_price,
          lowStockThreshold: v.low_stock_threshold,
        })),
      })
      setImagePath(product.image_path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, variants?.length])

  const hasPurchaseUnit = form.watch('hasPurchaseUnit')

  const selectedCategoryId = form.watch('categoryId')

  async function handleImageSelect(file: File) {
    if (!business) return
    setImageUploading(true)
    try {
      const path = await uploadBusinessScopedImage(PRODUCT_IMAGE_BUCKET, business.id, file, {
        kind: 'product-image',
        productId: product?.id,
      })
      setImagePath(path)
    } catch (error) {
      setServerError(toUploadErrorMessage(error))
    } finally {
      setImageUploading(false)
    }
  }

  async function onSubmit(values: EditFormValues) {
    if (!product) return
    setServerError(null)
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        name: values.name.trim(),
        description: values.description.trim() || null,
        category_id: values.categoryId || null,
        image_path: imagePath ?? null,
        base_unit: values.baseUnit,
        purchase_unit: values.hasPurchaseUnit ? values.purchaseUnit || null : null,
        purchase_conversion_qty: values.hasPurchaseUnit ? values.purchaseConversionQty || null : null,
      })

      await Promise.all(
        values.variants.map((v) =>
          updateVariant.mutateAsync({
            id: v.id,
            productId: product.id,
            sku: v.sku.trim() || null,
            barcode: v.barcode.trim() || null,
            selling_price: v.sellingPrice || '0',
            low_stock_threshold: v.lowStockThreshold || '0',
          }),
        ),
      )

      toast({ title: 'Product updated' })
      navigate(`/products/${product.id}`)
    } catch (error) {
      setServerError(toReadableError(error))
    }
  }

  if (isLoading) return <DetailSkeleton />
  if (isError || !product) return <ErrorState error={new Error('load')} onRetry={() => refetch()} />

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${product.name}`} />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <ImageUpload
                previewUrl={imagePreviewUrl}
                onSelect={handleImageSelect}
                onRemove={() => setImagePath(null)}
                uploading={imageUploading}
                label="Product image"
              />
              <div className="flex-1 space-y-4">
                <div>
                  <label className="text-sm font-medium text-text-primary">Product name</label>
                  <Input className="mt-1.5" {...form.register('name', { required: true })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-text-primary" htmlFor="edit-category">
                    Category
                  </label>
                  <div className="mt-1.5">
                    <CategoryField
                      id="edit-category"
                      value={selectedCategoryId}
                      onChange={(v) => form.setValue('categoryId', v)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-text-primary">Description</label>
              <Textarea className="mt-1.5" rows={3} {...form.register('description')} />
            </div>

            <div className="max-w-xs">
              <label className="text-sm font-medium text-text-primary">Base unit</label>
              <div className="mt-1.5">
                <UnitSelect
                  value={form.watch('baseUnit')}
                  onChange={(v) => form.setValue('baseUnit', v)}
                  id="edit-base-unit"
                  disabled={!!hasMovements}
                />
              </div>
              {hasMovements && (
                <p className="mt-1.5 text-sm text-text-muted">
                  Base unit can't be changed once stock movements exist.
                </p>
              )}
            </div>

            <div className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Buy in a different unit</p>
                  <p className="text-sm text-text-secondary">e.g. buy by the carton, sell by the piece</p>
                </div>
                <Switch
                  checked={hasPurchaseUnit}
                  onCheckedChange={(checked) => form.setValue('hasPurchaseUnit', checked)}
                  aria-label="Buy in a different unit"
                />
              </div>
              {hasPurchaseUnit && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Purchase unit</label>
                    <div className="mt-1.5">
                      <UnitSelect
                        value={form.watch('purchaseUnit')}
                        onChange={(v) => form.setValue('purchaseUnit', v)}
                        id="edit-purchase-unit"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-text-primary">Base units per purchase unit</label>
                    <QuantityInput className="mt-1.5" {...form.register('purchaseConversionQty')} />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Variants</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Price / {product?.base_unit ?? 'unit'}</TableHead>
                  <TableHead>Low-stock threshold ({product?.base_unit ?? 'units'})</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <TableCell className="font-medium text-text-primary">{field.label}</TableCell>
                    <TableCell><MoneyInput className="h-9" {...form.register(`variants.${index}.sellingPrice`)} /></TableCell>
                    <TableCell><QuantityInput className="h-9" {...form.register(`variants.${index}.lowStockThreshold`)} /></TableCell>
                    <TableCell><Input className="h-9" {...form.register(`variants.${index}.sku`)} /></TableCell>
                    <TableCell><Input className="h-9" {...form.register(`variants.${index}.barcode`)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {serverError && (
          <p role="alert" className="text-sm font-medium text-danger">{serverError}</p>
        )}
        {!online && <OfflineNotice />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(`/products/${product.id}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting || imageUploading || !online}>
            {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}
