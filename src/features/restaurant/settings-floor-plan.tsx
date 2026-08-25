import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Armchair, Loader2, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/data/empty-state'
import { NotePanel } from '@/components/ui/icon-badge'
import { Money } from '@/components/money/money'
import { useActiveBusiness, useDefaultLocation } from '@/features/business/hooks'
import { useDiningAreas, useDiningTables, useModifierOptions } from '@/features/restaurant/use-restaurant'
import { useBusinessVertical, usePosConfig } from '@/features/pos/use-pos-config'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * Floor plan and modifier setup — owner/manager territory.
 *
 * Turning tables on without a way to create any leaves the operator on an
 * empty floor with nothing to tap, which is the worst possible reading of a
 * feature: it looks broken rather than unconfigured. A switch and the setup it
 * implies belong in the same place.
 */
export function SettingsFloorPlanPage() {
  const { business, role } = useActiveBusiness()
  const { data: location } = useDefaultLocation()
  const { data: config } = usePosConfig()
  const vertical = useBusinessVertical()
  const qc = useQueryClient()

  const { data: areas } = useDiningAreas()
  const { data: tables } = useDiningTables()
  const { data: modifiers } = useModifierOptions()

  const canManage = role === 'owner' || role === 'manager'

  const [areaName, setAreaName] = useState('')
  const [tableLabel, setTableLabel] = useState('')
  const [tableSeats, setTableSeats] = useState('2')
  const [tableArea, setTableArea] = useState<string>('none')
  const [modGroup, setModGroup] = useState('')
  const [modLabel, setModLabel] = useState('')
  const [modDelta, setModDelta] = useState('')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dining-areas', business?.id] })
    qc.invalidateQueries({ queryKey: ['dining-tables', business?.id] })
    qc.invalidateQueries({ queryKey: ['modifier-options', business?.id] })
  }

  function fail(error: unknown, title: string) {
    toast({ variant: 'destructive', title, description: toReadableError(error) })
  }

  const createArea = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('dining_areas').insert({
        business_id: business!.id,
        location_id: location!.id,
        name: name.trim(),
        sort_order: areas?.length ?? 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setAreaName('')
      invalidate()
    },
  })

  const createTable = useMutation({
    mutationFn: async (input: { label: string; seats: number; areaId: string | null }) => {
      const { error } = await supabase.from('dining_tables').insert({
        business_id: business!.id,
        area_id: input.areaId,
        label: input.label.trim(),
        seats: input.seats,
        sort_order: tables?.length ?? 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTableLabel('')
      invalidate()
    },
  })

  const removeTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dining_tables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const createModifier = useMutation({
    mutationFn: async (input: { group: string; label: string; delta: string }) => {
      const { error } = await supabase.from('modifier_options').insert({
        business_id: business!.id,
        group_name: input.group.trim(),
        label: input.label.trim(),
        price_delta: input.delta.trim() || '0',
        sort_order: modifiers?.length ?? 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setModLabel('')
      setModDelta('')
      invalidate()
    },
  })

  const removeModifier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('modifier_options').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  function submitArea(e: FormEvent) {
    e.preventDefault()
    if (!areaName.trim()) return
    createArea.mutate(areaName, { onError: (err) => fail(err, "Couldn't add that area") })
  }

  function submitTable(e: FormEvent) {
    e.preventDefault()
    const seats = Number(tableSeats)
    if (!tableLabel.trim() || !Number.isFinite(seats) || seats < 1) return
    createTable.mutate(
      { label: tableLabel, seats, areaId: tableArea === 'none' ? null : tableArea },
      // The unique index is on (business_id, label), so a duplicate table
      // number is the likely failure and worth naming rather than dumping.
      { onError: (err) => fail(err, `Couldn't add table ${tableLabel.trim()}`) },
    )
  }

  function submitModifier(e: FormEvent) {
    e.preventDefault()
    if (!modGroup.trim() || !modLabel.trim()) return
    createModifier.mutate(
      { group: modGroup, label: modLabel, delta: modDelta },
      { onError: (err) => fail(err, "Couldn't add that option") },
    )
  }

  const modifierGroups = [
    ...new Map((modifiers ?? []).map((m) => [m.group_name, [] as typeof modifiers])).keys(),
  ]

  return (
    <div className="space-y-6">
      {vertical !== 'restaurant' && (
        <NotePanel tone="neutral">
          This business is set up as {vertical}. Tables and modifiers only appear on the till when
          the business type is Restaurant, or the tables switch is on in Settings → Till.
        </NotePanel>
      )}
      {vertical === 'restaurant' && !config?.tables_enabled && (
        <NotePanel tone="warning">
          Tables are switched off in Settings → Till, so the floor plan below will not appear on the
          till yet.
        </NotePanel>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dining areas</CardTitle>
            <CardDescription>
              Optional groupings — Main dining, Terrace, Bar. A table does not need one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submitArea} className="flex gap-2">
              <Input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Area name"
                aria-label="New area name"
                disabled={!canManage}
              />
              <Button type="submit" disabled={!canManage || !areaName.trim() || createArea.isPending}>
                {createArea.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add
              </Button>
            </form>

            {areas && areas.length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {areas.map((area) => (
                  <li key={area.id} className="px-3 py-2.5 text-sm text-text-primary">
                    {area.name}
                    <span className="type-meta ml-2">
                      {(tables ?? []).filter((t) => t.area_id === area.id).length} tables
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-meta">No areas yet. Tables without an area still work.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
            <CardDescription>
              The label is what a server sees on the floor plan and on the ticket.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submitTable} className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="table-label">Label</Label>
                  <Input
                    id="table-label"
                    value={tableLabel}
                    onChange={(e) => setTableLabel(e.target.value)}
                    placeholder="01, T4, Bar 2…"
                    disabled={!canManage}
                    className="mt-1.5"
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor="table-seats">Seats</Label>
                  <Input
                    id="table-seats"
                    type="number"
                    min={1}
                    value={tableSeats}
                    onChange={(e) => setTableSeats(e.target.value)}
                    disabled={!canManage}
                    className="mt-1.5"
                  />
                </div>
              </div>
              {areas && areas.length > 0 && (
                <div>
                  <Label htmlFor="table-area">Area</Label>
                  <Select value={tableArea} onValueChange={setTableArea} disabled={!canManage}>
                    <SelectTrigger id="table-area" className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No area</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                type="submit"
                disabled={!canManage || !tableLabel.trim() || createTable.isPending}
              >
                {createTable.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add table
              </Button>
            </form>

            {tables && tables.length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {tables.map((table) => (
                  <li key={table.id} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="font-semibold text-text-primary">{table.label}</span>
                    <span className="type-meta flex items-center gap-1">
                      <Armchair className="size-3.5" aria-hidden /> {table.seats}
                    </span>
                    <span className="type-meta ml-auto">
                      {areas?.find((a) => a.id === table.area_id)?.name ?? 'No area'}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={!canManage}
                      onClick={() =>
                        removeTable.mutate(table.id, {
                          // A table with history cannot be deleted; the FK is
                          // "on delete set null" on orders, so this normally
                          // succeeds and the past orders keep their totals.
                          onError: (err) => fail(err, `Couldn't remove table ${table.label}`),
                        })
                      }
                      aria-label={`Remove table ${table.label}`}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={UtensilsCrossed}
                title="No tables yet"
                description="Add the first one above. Takeaway and delivery orders work without tables."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item options</CardTitle>
          <CardDescription>
            The reusable list a server picks from — "no onions", "extra cheese". A price of zero is
            fine; a positive one is added to that line. Servers can always type a one-off option
            that is not on this list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitModifier} className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <Label htmlFor="mod-group">Group</Label>
              <Input
                id="mod-group"
                value={modGroup}
                onChange={(e) => setModGroup(e.target.value)}
                placeholder="Preferences, Extras…"
                list="modifier-groups"
                disabled={!canManage}
                className="mt-1.5"
              />
              <datalist id="modifier-groups">
                {modifierGroups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="mod-label">Option</Label>
              <Input
                id="mod-label"
                value={modLabel}
                onChange={(e) => setModLabel(e.target.value)}
                placeholder="No onions"
                disabled={!canManage}
                className="mt-1.5"
              />
            </div>
            <div className="w-32">
              <Label htmlFor="mod-delta">Extra charge</Label>
              <Input
                id="mod-delta"
                value={modDelta}
                onChange={(e) => setModDelta(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                disabled={!canManage}
                className="mt-1.5"
              />
            </div>
            <Button
              type="submit"
              disabled={!canManage || !modGroup.trim() || !modLabel.trim() || createModifier.isPending}
            >
              {createModifier.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </form>

          {modifiers && modifiers.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {modifiers.map((option) => (
                <li key={option.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="type-meta w-32 shrink-0 truncate">{option.group_name}</span>
                  <span className="flex-1 text-sm text-text-primary">{option.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-text-secondary">
                    {Number(option.price_delta) === 0 ? '—' : <Money value={option.price_delta} />}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!canManage}
                    onClick={() =>
                      removeModifier.mutate(option.id, {
                        onError: (err) => fail(err, "Couldn't remove that option"),
                      })
                    }
                    aria-label={`Remove ${option.label}`}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-meta">
              Nothing saved yet. Servers can still type an option on any item.
            </p>
          )}
        </CardContent>
      </Card>

      {!canManage && (
        <NotePanel tone="neutral">
          Only an owner or manager can change the floor plan.
        </NotePanel>
      )}
    </div>
  )
}
