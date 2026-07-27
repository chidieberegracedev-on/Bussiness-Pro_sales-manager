import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { supplierSchema, type SupplierFormValues } from '@/features/procurement/schemas'
import {
  useCreateSupplier,
  useSupplier,
  useUpdateSupplier,
} from '@/features/procurement/use-suppliers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { FormSkeleton } from '@/components/data/loading-state'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

interface SupplierFormPageProps {
  mode: 'create' | 'edit'
}

export function SupplierFormPage({ mode }: SupplierFormPageProps) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: supplier, isLoading } = useSupplier(mode === 'edit' ? id : undefined)
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', phone: '', email: '', address: '', notes: '' },
  })

  useEffect(() => {
    if (mode === 'edit' && supplier) {
      form.reset({
        name: supplier.name,
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id])

  async function onSubmit(values: SupplierFormValues) {
    try {
      if (mode === 'create') {
        const created = await createSupplier.mutateAsync({
          name: values.name,
          phone: values.phone || null,
          email: values.email || null,
          address: values.address || null,
          notes: values.notes || null,
        })
        toast({ title: 'Supplier added', description: created.name })
        navigate(`/suppliers/${created.id}`, { replace: true })
      } else {
        await updateSupplier.mutateAsync({
          id: id!,
          name: values.name,
          phone: values.phone || null,
          email: values.email || null,
          address: values.address || null,
          notes: values.notes || null,
        })
        toast({ title: 'Supplier updated' })
        navigate(`/suppliers/${id}`)
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: mode === 'create' ? "Couldn't add supplier" : "Couldn't save supplier",
        description: toReadableError(error),
      })
    }
  }

  const submitting = createSupplier.isPending || updateSupplier.isPending
  const isEditLoading = mode === 'edit' && isLoading

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="size-4" /> Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'New supplier' : 'Edit supplier'}</CardTitle>
        </CardHeader>
        {isEditLoading ? (
          <CardContent>
            <FormSkeleton fields={5} />
          </CardContent>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Lagos Wholesale Co." autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional" inputMode="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional" type="email" inputMode="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Payment terms, contact person, delivery windows…" rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {mode === 'create' ? 'Add supplier' : 'Save changes'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        )}
      </Card>
    </div>
  )
}
