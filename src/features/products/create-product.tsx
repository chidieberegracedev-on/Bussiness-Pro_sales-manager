import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { uploadBusinessScopedImage, createSignedImageUrl, toUploadErrorMessage } from '@/lib/image-upload'
import { PRODUCT_IMAGE_BUCKET } from '@/lib/storage-buckets'
import { useActiveBusiness } from '@/features/business/hooks'
import { CategoryField } from '@/features/products/category-field'
import { createProductSchema, type CreateProductValues } from '@/features/products/schemas'
import { OptionsBuilder, type OptionDef } from '@/features/products/options-builder'
import { CombinationTable } from '@/features/products/combination-table'
import { PricingHelperPreview, pricingLabel, thresholdLabel } from '@/features/products/pricing-helper'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { UnitSelect } from '@/components/quantity/unit-select'
import { QuantityInput } from '@/components/quantity/quantity-input'
import { MoneyInput } from '@/components/money/money-input'
import { ImageUpload } from '@/components/data/image-upload'
import { OfflineNotice } from '@/components/data/offline-notice'
import { useOnlineStatus } from '@/hooks/use-online-status'

function newVariantRow(optionValues: string[]) {
  return {
    id: crypto.randomUUID(),
    openingMovementId: crypto.randomUUID(),
    optionValues,
    sku: '',
    barcode: '',
    sellingPrice: '',
    costPrice: '',
    openingQty: '0',
    lowStockThreshold: '0',
  }
}

export function CreateProductPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { business } = useActiveBusiness()

  const [serverError, setServerError] = useState<string | null>(null)
  const online = useOnlineStatus()
  const [imageUploading, setImageUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | undefined>(undefined)
  const [optionDefs, setOptionDefs] = useState<OptionDef[]>([{ name: '', valuesText: '' }])

  const form = useForm<CreateProductValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      imagePath: '',
      baseUnit: 'piece',
      hasPurchaseUnit: false,
      purchaseUnit: '',
      purchaseConversionQty: '',
      hasOptions: false,
      optionNames: [],
      variants: [newVariantRow([])],
    },
  })

  const { fields, replace, remove } = useFieldArray({ control: form.control, name: 'variants' })

  const hasOptions = form.watch('hasOptions')
  const hasPurchaseUnit = form.watch('hasPurchaseUnit')
  const purchaseUnit = form.watch('purchaseUnit')
  const purchaseConversionQty = form.watch('purchaseConversionQty')
  const baseUnit = form.watch('baseUnit')

  function handleToggleOptions(checked: boolean) {
    form.setValue('hasOptions', checked)
    if (!checked) {
      form.setValue('optionNames', [])
      replace([newVariantRow([])])
    } else {
      replace([])
    }
  }

  function handleGenerate(optionNames: string[], combinations: string[][]) {
    form.setValue('optionNames', optionNames)
    replace(combinations.map((combo) => newVariantRow(combo)))
  }

  async function handleImageSelect(file: File) {
    if (!business) return
    setImageUploading(true)
    try {
      // No product id yet — the product doesn't exist until this form submits.
      const path = await uploadBusinessScopedImage(PRODUCT_IMAGE_BUCKET, business.id, file, { kind: 'product-image' })
      form.setValue('imagePath', path)
      setImagePreview(await createSignedImageUrl(PRODUCT_IMAGE_BUCKET, path))
    } catch (error) {
      setServerError(toUploadErrorMessage(error))
    } finally {
      setImageUploading(false)
    }
  }

  async function onSubmit(values: CreateProductValues) {
    if (!business) return
    setServerError(null)

    // Cost is entered per PURCHASE unit when a purchase unit is set (Cost /
    // Carton) but opening_unit_cost expects per BASE unit. Divide before
    // sending so 14,900/carton with conversion 44 stores as 338.6364/piece
    // in the ledger (FIX 007 §Issue 1). Selling price stays per base unit.
    const conv = new Decimal(values.purchaseConversionQty || '0')
    const shouldConvertCost = values.hasPurchaseUnit && conv.gt(0)

    const payload = values.variants.map((v) => {
      const enteredCost = new Decimal(v.costPrice || '0')
      const perBaseCost = shouldConvertCost ? enteredCost.div(conv) : enteredCost
      return {
        id: v.id,
        option_values: v.optionValues,
        variant_name: v.optionValues.length ? v.optionValues.join(' / ') : null,
        sku: v.sku || null,
        barcode: v.barcode || null,
        selling_price: Number(v.sellingPrice || 0),
        low_stock_threshold: Number(v.lowStockThreshold || 0),
        opening_qty: Number(v.openingQty || 0),
        opening_unit_cost: perBaseCost.toNumber(),
        opening_movement_id: v.openingMovementId,
      }
    })

    const { data, error } = await supabase.rpc('create_product', {
      p_business_id: business.id,
      p_name: values.name,
      p_variants: payload,
      p_description: null,
      p_category_id: values.categoryId || null,
      p_image_path: values.imagePath || null,
      p_base_unit: values.baseUnit,
      p_purchase_unit: values.hasPurchaseUnit ? values.purchaseUnit || null : null,
      p_purchase_conversion_qty: values.hasPurchaseUnit ? Number(values.purchaseConversionQty) : null,
      p_option_names: values.hasOptions ? values.optionNames : [],
    })

    if (error || !data) {
      console.error('[create_product] failed', error)
      setServerError(toReadableError(error))
      return
    }

    await queryClient.invalidateQueries({ queryKey: ['product-list'] })
    navigate(`/products/${data.id}`, { replace: true })
  }

  const conversionPreview =
    hasPurchaseUnit && purchaseUnit && purchaseConversionQty && Number(purchaseConversionQty) > 0
      ? `1 ${purchaseUnit} = ${purchaseConversionQty} ${baseUnit}`
      : null

  return (
    <div>
      <PageHeader title="New product" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <ImageUpload previewUrl={imagePreview} onSelect={handleImageSelect} uploading={imageUploading} label="Product image" />
                <div className="flex-1 space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product name</FormLabel>
                        <FormControl>
                          <Input placeholder="Sourdough Loaf" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <CategoryField value={field.value ?? ''} onChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="baseUnit"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Base unit</FormLabel>
                    <FormControl>
                      <UnitSelect value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormDescription>Stock is always counted in this unit.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                    <FormField
                      control={form.control}
                      name="purchaseUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Purchase unit</FormLabel>
                          <FormControl>
                            <UnitSelect value={field.value} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="purchaseConversionQty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Base units per purchase unit</FormLabel>
                          <FormControl>
                            <QuantityInput placeholder="24" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {conversionPreview && (
                      <p className="col-span-2 text-sm text-text-secondary">{conversionPreview}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Options</CardTitle>
                  <CardDescription>Does this product come in different sizes, colors, etc.?</CardDescription>
                </div>
                <Switch checked={hasOptions} onCheckedChange={handleToggleOptions} aria-label="This product has options" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasOptions ? (
                <>
                  <OptionsBuilder optionDefs={optionDefs} onOptionDefsChange={setOptionDefs} onGenerate={handleGenerate} />
                  <CombinationTable form={form} fields={fields} remove={remove} />
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="variants.0.sellingPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{pricingLabel('Selling price', baseUnit || 'unit')}</FormLabel>
                        <FormControl>
                          <MoneyInput placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="variants.0.costPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {pricingLabel(
                            'Cost price',
                            hasPurchaseUnit && purchaseUnit ? purchaseUnit : baseUnit || 'unit',
                          )}
                        </FormLabel>
                        <FormControl>
                          <MoneyInput placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <PricingHelperPreview
                    hasPurchaseUnit={hasPurchaseUnit && !!purchaseUnit}
                    purchaseUnit={purchaseUnit || ''}
                    baseUnit={baseUnit || 'unit'}
                    conversion={purchaseConversionQty || ''}
                    costPrice={form.watch('variants.0.costPrice') || ''}
                    sellingPrice={form.watch('variants.0.sellingPrice') || ''}
                  />
                  <FormField
                    control={form.control}
                    name="variants.0.openingQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Opening quantity ({baseUnit || 'units'})</FormLabel>
                        <FormControl>
                          <QuantityInput placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="variants.0.lowStockThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{thresholdLabel(baseUnit || 'unit')}</FormLabel>
                        <FormControl>
                          <QuantityInput placeholder="0" {...field} />
                        </FormControl>
                        <FormDescription>0 turns off low-stock alerts for this item.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="variants.0.sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="variants.0.barcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Barcode (optional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {serverError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {serverError}
            </p>
          )}

          {!online && <OfflineNotice />}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || imageUploading || !online}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Save product
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
