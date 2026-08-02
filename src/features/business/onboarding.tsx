import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Store } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { COUNTRIES, getCountry } from '@/lib/countries'
import { useBusinessStore } from '@/features/business/store'
import { useCartStore } from '@/features/pos/cart-store'
import { createBusinessSchema, type CreateBusinessValues } from '@/features/business/schemas'
import { TimezoneSelect } from '@/features/business/timezone-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setActiveBusiness = useBusinessStore((s) => s.setActiveBusiness)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<CreateBusinessValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: { name: '', countryCode: '', currencyCode: '', timezone: 'UTC' },
  })

  function handleCountryChange(code: string) {
    form.setValue('countryCode', code)
    const country = getCountry(code)
    if (country) {
      form.setValue('currencyCode', country.currency)
      form.setValue('timezone', country.timezone)
    }
  }

  async function onSubmit(values: CreateBusinessValues) {
    setServerError(null)
    const { data, error } = await supabase.rpc('create_business', {
      p_name: values.name,
      p_currency_code: values.currencyCode,
      p_timezone: values.timezone,
      p_country_code: values.countryCode,
    })

    if (error || !data) {
      setServerError(toReadableError(error))
      return
    }

    // Not invalidateQueries: the memberships query has no active observer on
    // this route (RequireBusiness is a sibling of /onboarding, not mounted
    // here), so invalidate's default refetchType: 'active' would skip it —
    // the stale cached empty list would still be there when RequireBusiness
    // mounts after navigate(), bouncing straight back to /onboarding. clear()
    // forces a genuine refetch instead, matching select-business.tsx and
    // business-switcher.tsx.
    queryClient.clear()
    useCartStore.getState().reset()
    setActiveBusiness(data.id)
    navigate('/products', { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background-subtle px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">Set up your business</h1>
          <p className="mt-1 text-sm text-text-secondary">
            This creates your business, makes you the owner, and sets up your first location.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input placeholder="Northside Retail" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select value={field.value} onValueChange={handleCountryChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="currencyCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input maxLength={3} className="uppercase" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timezone</FormLabel>
                      <FormControl>
                        <TimezoneSelect value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {serverError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {serverError}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                Create business
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  )
}
