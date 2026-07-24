import Decimal from 'decimal.js'

export interface UnitGroup {
  label: string
  units: string[]
}

// Both metric and imperial are first-class. Never filter by country.
export const UNIT_GROUPS: UnitGroup[] = [
  { label: 'Count', units: ['piece', 'pack', 'box', 'carton', 'case', 'dozen', 'pair', 'set', 'bundle'] },
  { label: 'Weight', units: ['mg', 'g', 'kg', 'oz', 'lb'] },
  { label: 'Volume', units: ['ml', 'l', 'fl oz', 'pint', 'quart', 'gallon'] },
  { label: 'Length', units: ['mm', 'cm', 'm', 'in', 'ft', 'yd'] },
  { label: 'Other', units: ['hour', 'day', 'service', 'custom'] },
]

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units)

export type QuantityInput = string | number | Decimal | null | undefined

export const toQuantity = (v: QuantityInput): Decimal => new Decimal(v ?? 0)

/** Formats a quantity to up to 3 decimal places, trailing zeros trimmed. */
export function formatQuantity(value: QuantityInput, locale: string = navigator.language): string {
  const dec = toQuantity(value)
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(dec.toNumber())
}

/** Converts a purchase-unit quantity into base units. Never re-derived after entry. */
export function convertToBaseUnits(purchaseQty: QuantityInput, conversionQty: QuantityInput): Decimal {
  return toQuantity(purchaseQty).times(toQuantity(conversionQty))
}
