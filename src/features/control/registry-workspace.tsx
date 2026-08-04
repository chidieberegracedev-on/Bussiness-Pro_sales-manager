import { useState } from 'react'
import Decimal from 'decimal.js'
import {
  Lock,
  ShoppingCart,
  Clock,
  Wallet,
  Banknote,
  Vault,
  Receipt,
  PauseCircle,
  PlayCircle,
  LogOut,
  Undo2,
  Trash2,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react'
import { ProductPicker } from '@/features/pos/product-picker'
import { CartPanel } from '@/features/pos/cart-panel'
import { PaymentDialog } from '@/features/pos/payment-dialog'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useLockSession, useEndSession } from '@/features/control/use-session'
import { useAuthorizationGate } from '@/features/control/use-authorization'
import { ManagerPinModal } from '@/features/control/manager-pin-modal'
import { HeldBasketsDialog } from '@/features/control/held-baskets-dialog'
import { useHoldBasket } from '@/features/control/use-held-baskets'
import { ROLE_LABELS } from '@/features/control/roles'
import { useOpenShift } from '@/features/finance/use-shifts'
import { useShiftCashSummary } from '@/features/control/use-shift-summary'
import { RecordExpenseDialog } from '@/features/finance/record-expense-dialog'
import { TransferCashDialog } from '@/features/finance/transfer-cash-dialog'
import { useDefaultLocation } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { useActiveBusiness } from '@/features/business/hooks'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { recordActorActivity } from '@/features/control/activity'
import { OpenShiftDialog, CloseShiftDialog } from '@/features/control/shift-controls'
import { useScanToBasket } from '@/features/scan/use-scan-to-basket'
import { ScanStrip } from '@/features/scan/scan-strip'
import { useRegistryShortcuts, SHORTCUT_HINTS } from '@/features/control/use-registry-shortcuts'

/**
 * The cashier canvas. Deliberately narrow: selling, the basket, receipts, and
 * their own shift. No cost, supplier, valuation, or business analytics — and the
 * server rejects those actions regardless of what is rendered (BR-C2.2).
 */
export function RegistryWorkspace() {
  const { business, membership } = useActiveBusiness()
  const locale = useLocale()
  const context = useEmployeeSessionStore((s) => s.context)
  const { data: location } = useDefaultLocation()
  const { data: openShift, isLoading: shiftLoading } = useOpenShift(location?.id)
  const summary = useShiftCashSummary(openShift?.id)

  const lines = useCartStore((s) => s.lines)
  const removeLine = useCartStore((s) => s.removeLine)
  const reset = useCartStore((s) => s.reset)
  const subtotal = cartSubtotal(lines)

  const lock = useLockSession()
  const endSession = useEndSession()
  const holdBasket = useHoldBasket()
  const gate = useAuthorizationGate()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [safeDropOpen, setSafeDropOpen] = useState(false)
  const [openShiftOpen, setOpenShiftOpen] = useState(false)
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)

  // Scanning is disabled while a modal owns the screen, so a scan can't drop an
  // item into the basket behind an open payment dialog.
  const scanIdle = !paymentOpen && !heldOpen && !expenseOpen && !safeDropOpen &&
    !openShiftOpen && !closeShiftOpen && !mobileCartOpen
  const { feedback: scanFeedback } = useScanToBasket(scanIdle)

  const drawerCash = summary.data?.drawerCash ?? new Decimal(openShift?.opening_float ?? '0')

  // With no PIN session the person at the till is the account holder.
  const operatorName = context?.display_name ?? membership?.display_name ?? ''

  /** Clearing the whole basket is a gated action (BR-C4.6). */
  async function clearBasket() {
    if (lines.length === 0) return
    const grant = await gate.request('void', {
      amount: subtotal.toFixed(4),
      shiftId: openShift?.id ?? null,
    })
    if (!grant?.granted) return
    await recordActorActivity({
      businessId: business!.id,
      actionType: 'basket_voided',
      fallbackMemberId: membership?.id ?? null,
      authorizedBy: grant.authorized_by ?? null,
      terminalId: context?.terminal_id ?? null,
      shiftId: openShift?.id ?? null,
      severity: grant.authorized_by !== grant.initiated_by ? 'notice' : 'info',
      detail: { item_count: lines.length, total: subtotal.toFixed(4) },
    })
    reset()
    toast({ title: 'Basket cleared' })
  }

  /** Removing a single line is the same gate with that line's value. */
  async function voidLine(variantId: string) {
    const line = lines.find((l) => l.variantId === variantId)
    if (!line) return
    const lineTotal = line.quantity.times(line.unitPrice)
    const grant = await gate.request('void', {
      amount: lineTotal.toFixed(4),
      shiftId: openShift?.id ?? null,
    })
    if (!grant?.granted) return
    await recordActorActivity({
      businessId: business!.id,
      actionType: 'line_voided',
      fallbackMemberId: membership?.id ?? null,
      authorizedBy: grant.authorized_by ?? null,
      terminalId: context?.terminal_id ?? null,
      shiftId: openShift?.id ?? null,
      severity: grant.authorized_by !== grant.initiated_by ? 'notice' : 'info',
      detail: { product: line.productName, total: lineTotal.toFixed(4) },
    })
    removeLine(variantId)
  }

  async function requestSafeDrop() {
    const grant = await gate.request('safe_drop', { shiftId: openShift?.id ?? null })
    if (!grant?.granted) return
    setSafeDropOpen(true)
  }

  async function hold() {
    if (lines.length === 0) return
    try {
      await holdBasket.mutateAsync({
        lines,
        label: `${lines.length} item${lines.length === 1 ? '' : 's'} · ${subtotal.toFixed(2)}`,
        shiftId: openShift?.id ?? null,
      })
      reset()
      toast({ title: 'Basket held', description: 'Resume it from Held baskets.' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't hold basket",
        description: toReadableError(error),
      })
    }
  }

  // Hands stay on the scanner and the number pad, not the mouse.
  useRegistryShortcuts(
    {
      onPay: () => lines.length > 0 && setPaymentOpen(true),
      onHold: () => void hold(),
      onResume: () => setHeldOpen(true),
      onPettyCash: () => openShift && setExpenseOpen(true),
      onSafeDrop: () => void requestSafeDrop(),
      onShift: () => (openShift ? setCloseShiftOpen(true) : setOpenShiftOpen(true)),
      onClear: () => void clearBasket(),
    },
    scanIdle,
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background-subtle">
      {/* Session banner */}
      <header className="shrink-0 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2.5">
            <IconBadge tone="accent" size="md" className="text-sm font-semibold">
              {(operatorName || '?').slice(0, 1).toUpperCase()}
            </IconBadge>
            <div>
              <p className="text-sm font-semibold leading-tight text-text-primary">
                {operatorName || 'Operator'}
              </p>
              <p className="text-xs text-text-muted">
                {context ? ROLE_LABELS[context.role] : membership ? ROLE_LABELS[membership.role] : ''}
                {context?.terminal_name && ` · ${context.terminal_name}`}
              </p>
            </div>
          </div>

          {/* The shift tools live in a column that's hidden below lg, so this
              chip is the only shift control a phone cashier ever sees. It has
              to be actionable at every width, not decorative. */}
          {shiftLoading ? (
            <Skeleton className="h-4 w-28" />
          ) : openShift && business ? (
            <button
              type="button"
              onClick={() => setCloseShiftOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
            >
              <Clock className="size-3.5 text-text-muted" />
              <span className="hidden sm:inline">
                Shift from {formatDateTime(openShift.opened_at, business.timezone, locale)}
              </span>
              <span className="sm:hidden">Shift open</span>
              <span className="font-medium text-accent-primary">· Close</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-warning px-2.5 py-1 text-xs font-medium text-tint-warning-foreground">
              <Clock className="size-3.5" /> No shift open
            </span>
          )}

          <div className="flex items-center gap-1.5 text-sm">
            <Wallet className="size-4 text-text-muted" />
            <span className="text-text-secondary">In drawer</span>
            <span className="font-semibold tabular-nums text-text-primary">
              <Money value={drawerCash} />
            </span>
          </div>

          {/* Nothing to lock or sign out of without an operator session — in
              single-owner mode the Supabase login is the whole session. */}
          {context && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => lock.mutate()}>
                <Lock className="size-3.5" /> Lock screen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => endSession.mutate()}
                aria-label="Sign out of this terminal"
              >
                <LogOut className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* A warning with no way to act on it is just noise. The button is the
          point of the banner. */}
      {!openShift && !shiftLoading && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-tint-warning px-4 py-2.5">
          <AlertTriangle className="size-4 shrink-0 text-tint-warning-foreground" />
          <p className="min-w-0 flex-1 text-sm text-tint-warning-foreground">
            No shift is open on this terminal. Cash sales won't be attached to a drawer until one is
            opened.
          </p>
          <Button size="sm" onClick={() => setOpenShiftOpen(true)}>
            <Clock className="size-3.5" /> Open shift
          </Button>
        </div>
      )}

      {/* Main: picker + basket */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-[2]">
          <ScanStrip feedback={scanFeedback} />
          <div className="min-h-0 flex-1">
            <ProductPicker />
          </div>
        </div>

        <div className="hidden min-h-0 w-[340px] shrink-0 flex-col gap-3 lg:flex">
          <div className="min-h-0 flex-1 rounded-2xl bg-card p-4 shadow-e2">
            <CartPanel
              onTakePayment={() => setPaymentOpen(true)}
              onRemoveLine={voidLine}
              onClear={clearBasket}
            />
          </div>

          {/* Registry control tools */}
          <Card elevation="raised" className="rounded-2xl">
            <CardContent className="grid grid-cols-3 gap-2 pt-4">
              <ToolButton icon={PauseCircle} label="Hold" onClick={hold} disabled={lines.length === 0} />
              <ToolButton icon={PlayCircle} label="Resume" onClick={() => setHeldOpen(true)} />
              <ToolButton icon={Undo2} label="Return" onClick={() => toast({ title: 'Start a return from Sales → the original receipt' })} />
              <ToolButton
                icon={Receipt}
                label="Petty cash"
                onClick={() => setExpenseOpen(true)}
                disabled={!openShift}
              />
              <ToolButton
                icon={Vault}
                label="Safe drop"
                onClick={requestSafeDrop}
                disabled={!openShift}
              />
              {/* The shift control lives with the other shift tools, and reads
                  as one slot that changes state rather than two that fight. */}
              {openShift ? (
                <ToolButton
                  icon={ClipboardCheck}
                  label="Close shift"
                  onClick={() => setCloseShiftOpen(true)}
                />
              ) : (
                <ToolButton
                  icon={Clock}
                  label="Open shift"
                  onClick={() => setOpenShiftOpen(true)}
                  disabled={shiftLoading}
                />
              )}
              <ToolButton
                icon={Trash2}
                label="Clear"
                onClick={clearBasket}
                disabled={lines.length === 0}
                danger
              />
            </CardContent>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-xs text-text-muted">
              {SHORTCUT_HINTS.map((hint) => (
                <span key={hint.key} className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-surface px-1 font-mono text-[10px]">
                    {hint.key}
                  </kbd>
                  {hint.label}
                </span>
              ))}
            </div>
          </Card>

          {/* Private shift stats — drawer-scoped only, never business-wide */}
          <Card elevation="raised" className="rounded-2xl">
            <CardContent className="space-y-1.5 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Your shift
                </p>
                {openShift && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-2 h-7 text-xs"
                    onClick={() => setCloseShiftOpen(true)}
                  >
                    Close / handover
                  </Button>
                )}
              </div>

              {/* Rows of zeros describe a drawer that doesn't exist. Say that,
                  and offer the one action that changes it. */}
              {!openShift && !shiftLoading ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <Clock className="mx-auto size-6 text-text-muted" />
                  <p className="mt-2 text-sm font-medium text-text-primary">No shift open</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Open one to start tracking this drawer.
                  </p>
                  <Button size="sm" className="mt-3 w-full" onClick={() => setOpenShiftOpen(true)}>
                    <Clock className="size-3.5" /> Open shift
                  </Button>
                </div>
              ) : (
                <>
              <StatLine
                icon={Wallet}
                label="Opening float"
                value={<Money value={openShift?.opening_float ?? '0'} />}
              />
              <StatLine
                icon={Wallet}
                label="Cash taken"
                value={
                  summary.isLoading ? (
                    <Skeleton className="h-3.5 w-16" />
                  ) : (
                    <Money value={summary.data?.cashIn ?? '0'} />
                  )
                }
              />
              <StatLine
                icon={Banknote}
                label="Card & transfer"
                value={
                  summary.isLoading ? (
                    <Skeleton className="h-3.5 w-16" />
                  ) : (
                    <Money value={summary.data?.bankIn ?? '0'} />
                  )
                }
              />
              <StatLine
                icon={Vault}
                label="Paid out / dropped"
                value={
                  summary.isLoading ? (
                    <Skeleton className="h-3.5 w-16" />
                  ) : (
                    <Money value={summary.data?.cashOut ?? '0'} />
                  )
                }
              />
              {/* The conclusion of the column, so it gets the accent and the
                  weight — the rows above are inputs to it. */}
              <div className="mt-2 flex items-center justify-between border-t border-dashed border-border pt-2.5">
                <span className="font-medium text-text-secondary">Expected in drawer</span>
                <span className="text-base font-bold tabular-nums text-accent-primary">
                  <Money value={drawerCash} />
                </span>
              </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile basket bar */}
      {lines.length > 0 && (
        <div className="sticky inset-x-0 bottom-0 z-30 bg-surface p-3 shadow-e3 lg:hidden">
          <Button className="w-full justify-between" size="lg" onClick={() => setMobileCartOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              {lines.length} item{lines.length === 1 ? '' : 's'}
            </span>
            <Money value={subtotal} />
          </Button>
        </div>
      )}

      <Dialog open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <DialogContent className="lg:hidden">
          <DialogHeader>
            <DialogTitle>Basket</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh]">
            <CartPanel
              onTakePayment={() => {
                setMobileCartOpen(false)
                setPaymentOpen(true)
              }}
              onRemoveLine={voidLine}
              onClear={clearBasket}
            />
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
      {heldOpen && <HeldBasketsDialog onClose={() => setHeldOpen(false)} />}
      <RecordExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      {safeDropOpen && (
        <TransferCashDialog
          initial={{ from: 'cash', to: 'safe', shiftId: openShift?.id }}
          onClose={() => setSafeDropOpen(false)}
        />
      )}

      {openShiftOpen && <OpenShiftDialog onClose={() => setOpenShiftOpen(false)} />}
      {closeShiftOpen && openShift && (
        <CloseShiftDialog
          shift={openShift}
          onClose={() => setCloseShiftOpen(false)}
          // Handover: the counted cash becomes the next shift's float, so the
          // drawer carries across a change of person without a second count.
          onHandover={() => setOpenShiftOpen(true)}
        />
      )}

      {gate.pending && (
        <ManagerPinModal pending={gate.pending} onResolve={gate.resolvePending} />
      )}
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // Recessed chips on the card rather than seven more outlined boxes: the
      // tool grid reads as one cluster, and the card keeps the only edge.
      className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
        danger
          ? 'bg-tint-danger text-tint-danger-foreground hover:bg-danger/20'
          : 'bg-background text-text-secondary hover:bg-surface-muted hover:text-text-primary'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function StatLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-text-secondary">
        <Icon className="size-3.5 text-text-muted" />
        {label}
      </span>
      <span className="tabular-nums text-text-primary">{value}</span>
    </div>
  )
}
