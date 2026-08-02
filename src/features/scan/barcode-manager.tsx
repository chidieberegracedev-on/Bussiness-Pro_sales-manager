import { useState, type FormEvent } from 'react'
import { Barcode, Plus, Trash2, Loader2, ScanLine, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useVariantBarcodes,
  useAddBarcode,
  useDeleteBarcode,
  BARCODE_KIND_LABELS,
  BARCODE_KIND_HINTS,
} from '@/features/scan/use-barcodes'
import { useExclusiveScanSubscription } from '@/features/scan/scan-engine'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { BarcodeKind } from '@/types/database'

const KINDS: BarcodeKind[] = ['manufacturer', 'internal', 'carton', 'warehouse', 'promotional', 'other']

/**
 * Multi-barcode management for a variant.
 *
 * One product genuinely has many codes: the manufacturer's EAN, the carton it
 * arrives in, an internal code you printed because the original rubbed off.
 * All of them must resolve to the same variant, and the carton one has to
 * declare how many base units it represents — that number is what stops a
 * carton scan from adding one pack instead of twelve.
 */
export function BarcodeManager({
  variantId,
  baseUnit,
  primaryBarcode,
}: {
  variantId: string
  baseUnit: string
  primaryBarcode?: string | null
}) {
  const { data: barcodes, isLoading } = useVariantBarcodes(variantId)
  const addBarcode = useAddBarcode()
  const deleteBarcode = useDeleteBarcode()

  const [code, setCode] = useState('')
  const [kind, setKind] = useState<BarcodeKind>('manufacturer')
  const [units, setUnits] = useState('1')

  // Scanning fills the field — typing a 13-digit EAN by hand is where errors
  // come from, and the scanner is right there.
  useExclusiveScanSubscription((event) => setCode(event.code), true)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    try {
      await addBarcode.mutateAsync({
        variantId,
        code: trimmed,
        kind,
        unitsPerScan: kind === 'carton' ? units || '1' : '1',
      })
      setCode('')
      setUnits('1')
      toast({ title: 'Barcode linked', description: trimmed })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't link that code",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="space-y-3">
      {primaryBarcode && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
          <Barcode className="size-4 shrink-0 text-text-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm text-text-primary">{primaryBarcode}</p>
            <p className="text-xs text-text-muted">Primary barcode · edit it on the product form</p>
          </div>
        </div>
      )}

      {isLoading && <Loader2 className="size-4 animate-spin text-text-muted" />}

      {!isLoading && (barcodes ?? []).length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(barcodes ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <Barcode className="size-4 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-text-primary">{row.code}</p>
                <p className="text-xs text-text-muted">
                  {BARCODE_KIND_LABELS[row.kind]}
                  {Number(row.units_per_scan) !== 1 &&
                    ` · 1 scan = ${row.units_per_scan} ${baseUnit}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove barcode ${row.code}`}
                onClick={() => deleteBarcode.mutate(row.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan or type a code"
              aria-label="Barcode"
              className="pl-9 font-mono"
            />
          </div>
          <Select value={kind} onValueChange={(v) => setKind(v as BarcodeKind)}>
            <SelectTrigger className="w-52" aria-label="Barcode type">
              <SelectValue>{BARCODE_KIND_LABELS[kind]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {BARCODE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {kind === 'carton' && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/30 bg-info/5 p-2.5">
            <Info className="size-4 shrink-0 text-info" />
            <label className="text-sm text-text-secondary">
              One scan of this code is
              <Input
                value={units}
                onChange={(e) => setUnits(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                aria-label={`Base units per scan`}
                className="mx-2 inline-block h-8 w-20 text-right"
              />
              {baseUnit}
            </label>
          </div>
        )}

        <p className="text-xs text-text-muted">{BARCODE_KIND_HINTS[kind]}</p>

        <Button type="submit" size="sm" disabled={!code.trim() || addBarcode.isPending}>
          {addBarcode.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Link this code
        </Button>
      </form>
    </div>
  )
}
