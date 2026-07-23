import Decimal from 'decimal.js'

// JavaScript `number` is a binary float and must never carry a monetary
// value through arithmetic (BR-7.1). Supabase returns NUMERIC as a string —
// keep it a Decimal until the final, post-rounding display conversion.
export type MoneyInput = string | number | Decimal | null | undefined

export const toDecimal = (v: MoneyInput): Decimal => new Decimal(v ?? 0)

export const addMoney = (a: MoneyInput, b: MoneyInput): Decimal => toDecimal(a).plus(toDecimal(b))
export const subMoney = (a: MoneyInput, b: MoneyInput): Decimal => toDecimal(a).minus(toDecimal(b))
export const mulMoney = (a: MoneyInput, b: MoneyInput): Decimal => toDecimal(a).times(toDecimal(b))

/**
 * Rounds to the business's currency exponent. Rounding happens here, at
 * display, never in storage (BR-7.3).
 */
export function roundToExponent(amount: MoneyInput, exponent: number): Decimal {
  return toDecimal(amount).toDecimalPlaces(exponent, Decimal.ROUND_HALF_UP)
}

/**
 * Formats a monetary amount. Currency symbol and precision come from the
 * business; separators and placement come from the user's locale (BR-7.4).
 */
export function formatMoney(
  amount: MoneyInput,
  currencyCode: string,
  exponent: number,
  locale: string = navigator.language,
): string {
  const rounded = roundToExponent(amount, exponent)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(rounded.toNumber())
}

/** Formats without a currency symbol, still exponent- and locale-aware. */
export function formatDecimalAmount(amount: MoneyInput, exponent: number, locale: string = navigator.language): string {
  const rounded = roundToExponent(amount, exponent)
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(rounded.toNumber())
}
