import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { uploadBusinessScopedImage, toUploadErrorMessage } from '@/lib/image-upload'
import { BUSINESS_LOGO_BUCKET } from '@/lib/storage-buckets'
import { useSignedImageUrl } from '@/hooks/use-signed-image-url'
import { useActiveBusiness } from '@/features/business/hooks'
import { businessSettingsSchema, type BusinessSettingsValues } from '@/features/business/schemas'
import { TimezoneSelect } from '@/features/business/timezone-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { ImageUpload } from '@/components/data/image-upload'
import { toast } from '@/hooks/use-toast'
import { FormSkeleton } from '@/components/data/loading-state'

export function SettingsBusinessPage() {
  const { business, isLoading } = useActiveBusiness()
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [logoPath, setLogoPath] = useState<string | null | undefined>(business?.logo_path)
  const { data: logoPreviewUrl } = useSignedImageUrl(BUSINESS_LOGO_BUCKET, logoPath)

  const form = useForm<BusinessSettingsValues>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: { name: business?.name ?? '', timezone: business?.timezone ?? 'UTC' },
  })

  useEffect(() => {
    if (business) {
      form.reset({ name: business.name, timezone: business.timezone })
      setLogoPath(business.logo_path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id])

  const mutation = useMutation({
    mutationFn: async (values: BusinessSettingsValues) => {
      if (!business) throw new Error('No active business')
      const { error } = await supabase
        .from('businesses')
        .update({ name: values.name, timezone: values.timezone, logo_path: logoPath ?? null })
        .eq('id', business.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      toast({ title: 'Business settings saved' })
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Could not save changes', description: toReadableError(error) })
    },
  })

  async function handleLogoSelect(file: File) {
    if (!business) return
    setUploading(true)
    try {
      const path = await uploadBusinessScopedImage(BUSINESS_LOGO_BUCKET, business.id, file, { kind: 'logo' })
      setLogoPath(path)
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not upload logo', description: toUploadErrorMessage(error) })
    } finally {
      setUploading(false)
    }
  }

  if (isLoading || !business) {
    return (
      <Card>
        <CardContent className="pt-6">
          <FormSkeleton fields={3} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
            <CardDescription>Name, logo, and timezone. Currency can't be changed after creation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <FormLabel>Logo</FormLabel>
              <div className="mt-2">
                <ImageUpload
                  previewUrl={logoPreviewUrl}
                  onSelect={handleLogoSelect}
                  onRemove={() => setLogoPath(null)}
                  uploading={uploading}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business name</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormDescription>Determines what "today" means for reports and dashboards.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Currency</FormLabel>
              <Input value={business.currency_code} disabled className="mt-2 max-w-32" />
              <p className="mt-1.5 text-sm text-text-muted">
                Currency is locked after creation — changing it would corrupt historical values. Create a new
                business if you need a different currency.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={mutation.isPending || uploading}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  )
}
