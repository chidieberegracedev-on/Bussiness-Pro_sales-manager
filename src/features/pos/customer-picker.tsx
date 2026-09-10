import { useState, type FormEvent } from 'react'
import { Loader2, Plus, Search, UserPlus, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCustomers, useCreateCustomer } from '@/features/pos/use-customers'
import { useCartStore } from '@/features/pos/cart-store'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'

/**
 * The customer control that sits at the top of the cart when capture_customer
 * is on. Attaching a customer is optional on every sale — a queue does not wait
 * while a walk-in is entered into a database — so this is a quiet chip, never a
 * gate in front of Charge.
 */
export function CustomerBar() {
  const customer = useCartStore((s) => s.customer)
  const setCustomer = useCartStore((s) => s.setCustomer)
  const [open, setOpen] = useState(false)

  return (
    <>
      {customer ? (
        <div className="flex items-center gap-2 rounded-xl bg-tint-accent px-3 py-2">
          <UserRound className="size-4 shrink-0 text-tint-accent-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tint-accent-foreground">
            {customer.name}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-tint-accent-foreground/80 hover:text-tint-accent-foreground"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => setCustomer(null)}
            aria-label="Remove customer from this sale"
            className="rounded-md p-0.5 text-tint-accent-foreground/70 hover:text-tint-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-text-primary"
        >
          <UserPlus className="size-4 shrink-0 text-icon-muted" aria-hidden />
          Add a customer
        </button>
      )}

      <CustomerPickerDialog
        open={open}
        onOpenChange={setOpen}
        onPick={(picked) => {
          setCustomer(picked)
          setOpen(false)
        }}
      />
    </>
  )
}

export function CustomerPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (customer: { id: string; name: string }) => void
}) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const { data: customers, isLoading } = useCustomers(search)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSearch('')
          setCreating(false)
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{creating ? 'New customer' : 'Attach a customer'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Only a name is required. Phone is how you will find them next time.'
              : 'Search by name or phone, or add someone new.'}
          </DialogDescription>
        </DialogHeader>

        {creating ? (
          <NewCustomerForm
            initialName={search.trim()}
            onCancel={() => setCreating(false)}
            onCreated={onPick}
          />
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or phone…"
                aria-label="Search customers"
                autoFocus
                className="pl-9"
              />
            </div>

            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <p className="type-meta px-1 py-3">Searching…</p>
              ) : customers && customers.length > 0 ? (
                <ul className="space-y-1">
                  {customers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onPick({ id: c.id, name: c.name })}
                        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-muted"
                      >
                        <UserRound className="size-4 shrink-0 text-icon-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-primary">
                            {c.name}
                          </span>
                          {c.phone && <span className="type-meta block truncate">{c.phone}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-meta px-1 py-3">
                  {search.trim() ? `No customer matches “${search.trim()}”.` : 'No customers yet.'}
                </p>
              )}
            </div>

            <Button variant="outline" onClick={() => setCreating(true)} className="w-full">
              <Plus className="size-4" /> New customer
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NewCustomerForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (customer: { id: string; name: string }) => void
}) {
  const createCustomer = useCreateCustomer()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await createCustomer.mutateAsync({ name, phone })
      onCreated({ id: created.id, name: created.name })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't save the customer",
        description: toReadableError(error),
      })
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="customer-name">Name</Label>
        <Input
          id="customer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="Full name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="customer-phone">Phone (optional)</Label>
        <Input
          id="customer-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="How you'll find them next time"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" disabled={!name.trim() || createCustomer.isPending}>
          {createCustomer.isPending && <Loader2 className="size-4 animate-spin" />}
          Save and attach
        </Button>
      </DialogFooter>
    </form>
  )
}
