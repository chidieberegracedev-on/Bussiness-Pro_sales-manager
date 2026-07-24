// Maps raw Postgres/PostgREST error signals to human sentences.
// A raw database error must never reach the user (AC-9.6, BR-8.5).
const SIGNAL_MAP: Array<[RegExp, string]> = [
  [/product_variants_sku_idx/i, 'That SKU is already used by another product.'],
  [/product_variants_barcode_idx/i, 'That barcode is already used by another product.'],
  [/product_categories_unique_name_idx/i, 'A category with that name already exists.'],
  [/locations_one_default_idx/i, 'This business already has a default location.'],
  [/insufficient permission/i, 'You need manager access to do this.'],
  [/at least one active owner/i, 'A business must always have an owner.'],
  [/append-only/i, "Stock history can't be edited. Record an adjustment instead."],
  [/authentication required/i, 'Please sign in again to continue.'],
  [/variant not found/i, "That item couldn't be found. It may have been removed."],
  [/location does not belong/i, 'That location is not part of this business.'],
  [/movement quantity must be non-zero/i, 'Enter a quantity other than zero.'],
  [/a product must have at least one variant/i, 'Add at least one variant before saving.'],
  [/no default location found/i, "This business doesn't have a default location yet."],
  [/option value\(s\) but the product defines/i, "This item's options don't match the product's configuration."],
]

export function toReadableError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : ''

  if (isNetworkError(error)) {
    return "Couldn't reach the server. Your changes weren't saved."
  }

  for (const [pattern, message] of SIGNAL_MAP) {
    if (pattern.test(raw)) return message
  }

  return 'Something went wrong. Please try again.'
}

export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  )
}
