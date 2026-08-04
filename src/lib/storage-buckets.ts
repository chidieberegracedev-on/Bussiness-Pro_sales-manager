export const BUSINESS_LOGO_BUCKET = 'business-logos'
export const PRODUCT_IMAGE_BUCKET = 'product-images'

/**
 * Network listing photos. Unlike the two buckets above this one is PUBLIC
 * (0028) — a marketplace photo is read by businesses that are not members of
 * the business that uploaded it, so a signed URL scoped by membership cannot
 * work. Read these with `networkImageUrl()`, never `createSignedImageUrl()`.
 *
 * The trade: an object here is readable by anyone holding its URL, including
 * after the listing is hidden. Only publish-intent images belong in it.
 */
export const NETWORK_IMAGE_BUCKET = 'network-images'
