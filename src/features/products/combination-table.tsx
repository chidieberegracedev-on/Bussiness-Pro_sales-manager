import { useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Trash2 } from 'lucide-react'
import type { CreateProductValues } from '@/features/products/schemas'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MoneyInput } from '@/components/money/money-input'
import { QuantityInput } from '@/components/quantity/quantity-input'

export function CombinationTable({
  form,
  fields,
  remove,
}: {
  form: UseFormReturn<CreateProductValues>
  fields: { id: string; optionValues: string[] }[]
  remove: (index: number) => void
}) {
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkCost, setBulkCost] = useState('')
  const baseUnit = form.watch('baseUnit') || 'unit'
  const hasPurchaseUnit = form.watch('hasPurchaseUnit')
  const purchaseUnit = form.watch('purchaseUnit')
  const costUnit = hasPurchaseUnit && purchaseUnit ? purchaseUnit : baseUnit

  function applyBulk() {
    fields.forEach((_, index) => {
      if (bulkPrice !== '') form.setValue(`variants.${index}.sellingPrice`, bulkPrice, { shouldValidate: true })
      if (bulkCost !== '') form.setValue(`variants.${index}.costPrice`, bulkCost, { shouldValidate: true })
    })
  }

  if (fields.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted/50 p-3">
        <div className="w-32">
          <label className="text-xs font-medium text-text-secondary">Bulk price</label>
          <MoneyInput value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="0.00" />
        </div>
        <div className="w-32">
          <label className="text-xs font-medium text-text-secondary">Bulk cost</label>
          <MoneyInput value={bulkCost} onChange={(e) => setBulkCost(e.target.value)} placeholder="0.00" />
        </div>
        <Button type="button" variant="outline" onClick={applyBulk}>
          Apply to all rows
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Options</TableHead>
              <TableHead className="w-32">Price / {baseUnit}</TableHead>
              <TableHead className="w-32">Cost / {costUnit}</TableHead>
              <TableHead className="w-28">Opening ({baseUnit})</TableHead>
              <TableHead className="w-32">SKU</TableHead>
              <TableHead className="w-32">Barcode</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell className="text-sm font-medium text-text-primary">
                  {field.optionValues.join(' / ')}
                </TableCell>
                <TableCell>
                  <MoneyInput {...form.register(`variants.${index}.sellingPrice`)} className="h-9" />
                </TableCell>
                <TableCell>
                  <MoneyInput {...form.register(`variants.${index}.costPrice`)} className="h-9" />
                </TableCell>
                <TableCell>
                  <QuantityInput {...form.register(`variants.${index}.openingQty`)} className="h-9" />
                </TableCell>
                <TableCell>
                  <Input {...form.register(`variants.${index}.sku`)} className="h-9" />
                </TableCell>
                <TableCell>
                  <Input {...form.register(`variants.${index}.barcode`)} className="h-9" />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    aria-label="Remove combination"
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {form.formState.errors.variants?.root?.message && (
        <p className="text-sm font-medium text-danger">{form.formState.errors.variants.root.message}</p>
      )}
    </div>
  )
}
