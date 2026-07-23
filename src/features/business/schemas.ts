import { z } from 'zod'

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(120),
  countryCode: z.string().length(2, 'Select a country'),
  currencyCode: z.string().length(3, 'Select a currency'),
  timezone: z.string().min(1, 'Select a timezone'),
})
export type CreateBusinessValues = z.infer<typeof createBusinessSchema>

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(120),
  timezone: z.string().min(1, 'Select a timezone'),
})
export type BusinessSettingsValues = z.infer<typeof businessSettingsSchema>
