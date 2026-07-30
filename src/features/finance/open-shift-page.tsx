import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Clock, MapPin, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { MoneyInput } from '@/components/money/money-input'
import { useDefaultLocation } from '@/features/business/hooks'
import { useOpenShift, useOpenShiftMutation } from '@/features/finance/use-shifts'
import { Term } from '@/features/help/term'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

export function OpenShiftPage() {
  const navigate = useNavigate()
  const { data: location } = useDefaultLocation()
  const { data: existing } = useOpenShift(location?.id)
  const openMutation = useOpenShiftMutation()

  const [openingFloat, setOpeningFloat] = useState('')

  async function handleOpen() {
    if (!location) return
    try {
      const shift = await openMutation.mutateAsync({
        locationId: location.id,
        openingFloat: openingFloat || '0',
      })
      toast({ title: 'Shift opened', description: 'Cash sales will attach automatically.' })
      navigate(`/shifts/${shift.id}/close`, { replace: true })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't open shift",
        description: toReadableError(error),
      })
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/shifts')}>
        <ArrowLeft className="size-4" /> Shifts
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" /> Open shift
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {existing && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text-secondary">
              A shift is already open at this location. Close it before opening another.
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/50 p-3 text-sm text-text-secondary">
            <MapPin className="size-4 text-text-muted" />
            <span>Location: <span className="font-medium text-text-primary">{location?.name ?? '—'}</span></span>
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary">
              Opening <Term slug="float">float</Term>
            </label>
            <MoneyInput
              className="mt-1.5"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="0.00"
              autoFocus
              disabled={!!existing}
            />
            <p className="mt-1.5 flex items-start gap-1 text-xs text-text-muted">
              <Info className="mt-0.5 size-3 shrink-0" />
              The cash you're starting the drawer with. Enter 0 if you're starting empty.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/shifts')}>
            Cancel
          </Button>
          <Button onClick={handleOpen} disabled={!location || !!existing || openMutation.isPending}>
            {openMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Open shift
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
