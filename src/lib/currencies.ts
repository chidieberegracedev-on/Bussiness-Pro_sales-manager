export interface CurrencyInfo {
  code: string
  name: string
  exponent: number
}

// ISO 4217 minor-unit exponents. Most currencies use 2; a handful use 0 or 3.
// Never assume 2 — JPY, KRW, VND, CLP, UGX use 0; KWD, BHD, OMR use 3.
export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', exponent: 2 },
  { code: 'EUR', name: 'Euro', exponent: 2 },
  { code: 'GBP', name: 'British Pound', exponent: 2 },
  { code: 'JPY', name: 'Japanese Yen', exponent: 0 },
  { code: 'CNY', name: 'Chinese Yuan', exponent: 2 },
  { code: 'INR', name: 'Indian Rupee', exponent: 2 },
  { code: 'CAD', name: 'Canadian Dollar', exponent: 2 },
  { code: 'AUD', name: 'Australian Dollar', exponent: 2 },
  { code: 'CHF', name: 'Swiss Franc', exponent: 2 },
  { code: 'SEK', name: 'Swedish Krona', exponent: 2 },
  { code: 'NOK', name: 'Norwegian Krone', exponent: 2 },
  { code: 'DKK', name: 'Danish Krone', exponent: 2 },
  { code: 'PLN', name: 'Polish Zloty', exponent: 2 },
  { code: 'CZK', name: 'Czech Koruna', exponent: 2 },
  { code: 'HUF', name: 'Hungarian Forint', exponent: 2 },
  { code: 'TRY', name: 'Turkish Lira', exponent: 2 },
  { code: 'RUB', name: 'Russian Ruble', exponent: 2 },
  { code: 'BRL', name: 'Brazilian Real', exponent: 2 },
  { code: 'MXN', name: 'Mexican Peso', exponent: 2 },
  { code: 'ARS', name: 'Argentine Peso', exponent: 2 },
  { code: 'CLP', name: 'Chilean Peso', exponent: 0 },
  { code: 'COP', name: 'Colombian Peso', exponent: 2 },
  { code: 'ZAR', name: 'South African Rand', exponent: 2 },
  { code: 'NGN', name: 'Nigerian Naira', exponent: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', exponent: 2 },
  { code: 'KES', name: 'Kenyan Shilling', exponent: 2 },
  { code: 'UGX', name: 'Ugandan Shilling', exponent: 0 },
  { code: 'TZS', name: 'Tanzanian Shilling', exponent: 2 },
  { code: 'EGP', name: 'Egyptian Pound', exponent: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', exponent: 2 },
  { code: 'AED', name: 'UAE Dirham', exponent: 2 },
  { code: 'SAR', name: 'Saudi Riyal', exponent: 2 },
  { code: 'QAR', name: 'Qatari Riyal', exponent: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', exponent: 3 },
  { code: 'BHD', name: 'Bahraini Dinar', exponent: 3 },
  { code: 'OMR', name: 'Omani Rial', exponent: 3 },
  { code: 'ILS', name: 'Israeli Shekel', exponent: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', exponent: 2 },
  { code: 'BDT', name: 'Bangladeshi Taka', exponent: 2 },
  { code: 'LKR', name: 'Sri Lankan Rupee', exponent: 2 },
  { code: 'NPR', name: 'Nepalese Rupee', exponent: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', exponent: 2 },
  { code: 'MYR', name: 'Malaysian Ringgit', exponent: 2 },
  { code: 'SGD', name: 'Singapore Dollar', exponent: 2 },
  { code: 'THB', name: 'Thai Baht', exponent: 2 },
  { code: 'VND', name: 'Vietnamese Dong', exponent: 0 },
  { code: 'PHP', name: 'Philippine Peso', exponent: 2 },
  { code: 'KRW', name: 'South Korean Won', exponent: 0 },
  { code: 'TWD', name: 'Taiwan Dollar', exponent: 2 },
  { code: 'HKD', name: 'Hong Kong Dollar', exponent: 2 },
  { code: 'NZD', name: 'New Zealand Dollar', exponent: 2 },
]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export function getCurrency(code: string): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, exponent: 2 }
}

export function currencyExponent(code: string): number {
  return getCurrency(code).exponent
}
