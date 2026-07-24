import type { StockStatus } from '@/types/database'

export interface VariantStockRow {
  variant_id: string
  business_id: string
  product_id: string
  product_name: string
  image_path: string | null
  base_unit: string
  has_variants: boolean
  category_id: string | null
  category_name: string | null
  variant_name: string | null
  option_values: string[]
  sku: string | null
  barcode: string | null
  selling_price: string
  low_stock_threshold: string
  is_active: boolean
  location_id: string | null
  qty_on_hand: string
  avg_cost: string
  stock_value: string
  stock_status: StockStatus
}

export interface GroupedProduct {
  productId: string
  productName: string
  imagePath: string | null
  baseUnit: string
  hasVariants: boolean
  categoryId: string | null
  categoryName: string | null
  isActive: boolean
  variants: VariantStockRow[]
  priceMin: string
  priceMax: string
  totalQty: string
  worstStatus: StockStatus
}

const STATUS_SEVERITY: Record<StockStatus, number> = { negative: 0, out_of_stock: 1, low: 2, ok: 3 }

export function groupByProduct(rows: VariantStockRow[]): GroupedProduct[] {
  const map = new Map<string, GroupedProduct>()

  for (const row of rows) {
    let group = map.get(row.product_id)
    if (!group) {
      group = {
        productId: row.product_id,
        productName: row.product_name,
        imagePath: row.image_path,
        baseUnit: row.base_unit,
        hasVariants: row.has_variants,
        categoryId: row.category_id,
        categoryName: row.category_name,
        isActive: row.is_active,
        variants: [],
        priceMin: row.selling_price,
        priceMax: row.selling_price,
        totalQty: '0',
        worstStatus: 'ok',
      }
      map.set(row.product_id, group)
    }

    group.variants.push(row)
    group.isActive = group.isActive || row.is_active
    if (Number(row.selling_price) < Number(group.priceMin)) group.priceMin = row.selling_price
    if (Number(row.selling_price) > Number(group.priceMax)) group.priceMax = row.selling_price
    group.totalQty = String(Number(group.totalQty) + Number(row.qty_on_hand))
    if (STATUS_SEVERITY[row.stock_status] < STATUS_SEVERITY[group.worstStatus]) {
      group.worstStatus = row.stock_status
    }
  }

  return Array.from(map.values())
}

export function variantLabel(v: VariantStockRow): string {
  return v.variant_name || v.option_values.join(' / ') || v.product_name
}

/** Builds the shared context consumed by the Add Stock / Adjust Stock dialogs. */
export function toStockDialogContext(product: GroupedProduct) {
  const first = product.variants[0]
  return {
    productId: product.productId,
    productName: product.productName,
    locationId: first?.location_id ?? '',
    baseUnit: product.baseUnit,
    variants: product.variants.map((v) => ({
      variantId: v.variant_id,
      label: variantLabel(v),
      qtyOnHand: v.qty_on_hand,
      avgCost: v.avg_cost,
    })),
  }
}
