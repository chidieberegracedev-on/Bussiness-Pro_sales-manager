import { z } from 'zod'

const decimalString = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || !Number.isNaN(Number(v)), message)

const variantRowSchema = z.object({
  id: z.string().uuid(),
  openingMovementId: z.string().uuid(),
  optionValues: z.array(z.string()),
  sku: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  sellingPrice: decimalString('Enter a valid price').refine((v) => v !== '' && Number(v) >= 0, 'Enter a valid price'),
  costPrice: decimalString('Enter a valid cost'),
  openingQty: decimalString('Enter a valid quantity'),
  lowStockThreshold: decimalString('Enter a valid threshold'),
})
export type VariantRowValues = z.infer<typeof variantRowSchema>

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required').max(200),
    categoryId: z.string().optional(),
    imagePath: z.string().optional(),
    baseUnit: z.string().min(1, 'Select a base unit'),
    hasPurchaseUnit: z.boolean(),
    purchaseUnit: z.string().optional(),
    purchaseConversionQty: decimalString('Enter a valid conversion quantity').optional(),
    hasOptions: z.boolean(),
    optionNames: z.array(z.string().trim().min(1)).max(3),
    variants: z.array(variantRowSchema).min(1, 'Add at least one variant'),
  })
  .superRefine((data, ctx) => {
    if (data.hasPurchaseUnit) {
      if (!data.purchaseUnit) {
        ctx.addIssue({ code: 'custom', message: 'Select a purchase unit', path: ['purchaseUnit'] })
      }
      if (!data.purchaseConversionQty || Number(data.purchaseConversionQty) <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter how many base units per purchase unit',
          path: ['purchaseConversionQty'],
        })
      }
    }
    for (const [index, variant] of data.variants.entries()) {
      const opening = Number(variant.openingQty || '0')
      if (opening > 0 && variant.costPrice === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'Cost is required when opening quantity is greater than zero',
          path: ['variants', index, 'costPrice'],
        })
      }
    }
  })
export type CreateProductValues = z.infer<typeof createProductSchema>
