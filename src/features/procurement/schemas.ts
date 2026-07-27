import { z } from 'zod'

const decimalString = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || !Number.isNaN(Number(v)), message)

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160, 'Name is too long'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})
export type SupplierFormValues = z.infer<typeof supplierSchema>

export const productSupplierLinkSchema = z.object({
  variantId: z.string().uuid('Pick a product'),
  supplierSku: z.string().trim().max(80).optional().or(z.literal('')),
  purchaseUnit: z.string().trim().min(1, 'Enter a purchase unit'),
  conversionToBase: decimalString('Enter a valid conversion')
    .refine((v) => v !== '' && Number(v) > 0, 'Conversion must be greater than zero'),
  lastPurchaseCost: decimalString('Enter a valid cost').optional(),
  isPreferred: z.boolean(),
})
export type ProductSupplierLinkValues = z.infer<typeof productSupplierLinkSchema>

export const poLineSchema = z.object({
  variantId: z.string().uuid(),
  productName: z.string(),
  variantName: z.string().optional(),
  purchaseUnit: z.string().min(1),
  conversionToBase: decimalString('Enter a valid conversion')
    .refine((v) => Number(v) > 0, 'Conversion must be greater than zero'),
  qtyOrderedPurchase: decimalString('Enter a quantity')
    .refine((v) => v !== '' && Number(v) > 0, 'Quantity must be greater than zero'),
  expectedUnitCost: decimalString('Enter a cost').refine((v) => v === '' || Number(v) >= 0, 'Cost cannot be negative'),
})
export type PoLineValues = z.infer<typeof poLineSchema>

export const createPoSchema = z.object({
  supplierId: z.string().uuid('Choose a supplier'),
  status: z.enum(['draft', 'ordered']),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  lines: z.array(poLineSchema).min(1, 'Add at least one item'),
})
export type CreatePoValues = z.infer<typeof createPoSchema>
