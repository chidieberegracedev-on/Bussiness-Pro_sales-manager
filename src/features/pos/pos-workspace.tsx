import { useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import {
  Banknote,
  Clock,
  History,
  Lock,
  LogOut,
  PauseCircle,
  Receipt,
  ScanLine,
  ShoppingCart,
  UserRound,
  Vault,
} from 'lucide-react'
import {
  WorkspaceShell,
  WorkspaceTopBar,
  WorkspaceTool,
  type WorkspaceNavGroup,
} from '@/components/workspace/workspace-shell'
import { WorkspacePanel } from '@/components/workspace/workspace-panel'
import { PosProductGrid } from '@/features/pos/pos-product-grid'
import { PosCart } from '@/features/pos/pos-cart'
import { PaymentDialog } from '@/features/pos/payment-dialog'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/money/money'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { IconBadge } from '@/components/ui/icon-badge'
import { useEmployeeSessionStore } from '@/features/control/session-store'
import { useLockSession, useEndSession } from '@/features/control/use-session'
import { useAuthorizationGate } from '@/features/control/use-authorization'
import { ManagerPinModal } from '@/features/control/manager-pin-modal'
import { HeldBasketsDialog } from '@/features/control/held-baskets-dialog'
import { useHeldBaskets, useHoldBasket } from '@/features/control/use-held-baskets'
import { ROLE_LABELS } from '@/features/control/roles'
import { useOpenShift } from '@/features/finance/use-shifts'
import { useShiftCashSummary } from '@/features/control/use-shift-summary'
import { OpenShiftDialog, CloseShiftDialog } from '@/features/control/shift-controls'
import { RecordExpenseDialog } from '@/features/finance/record-expense-dialog'
import { TransferCashDialog } from '@/features/finance/transfer-cash-dialog'
import { useDefaultLocation, useActiveBusiness } from '@/features/business/hooks'
import { usePosConfig } from '@/features/pos/use-pos-config'
import { RestaurantFloor } from '@/features/restaurant/restaurant-floor'
import { useTodaysSales } from '@/features/pos/use-todays-sales'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { recordActorActivity } from '@/features/control/activity'
import { useScanToBasket } from '@/features/scan/use-scan-to-basket'
import { ScanStrip } from '@/features/scan/scan-strip'
import { useRegistryShortcuts } from '@/features/control/use-registry-shortcuts'

type PanelKey = 'shift' | 'held' | 'cash' | 'history' | 'profile' | null

/**
 * The cashier's workspace.
 *
 * Its own environment, not the management shell with items hidden. The
 * navigation contains only what selling is made of, and every secondary
 * operation — shift, held orders, cash, history, who am I — is a top-bar icon
 * that opens a drawer over the cart rather than a button competing with
 * Charge on the selling surface.
 *
 * The transaction engine underneath is unchanged: complete_sale, held_baskets,
 * cash_shifts, resolve_barcode. This is a new surface over the same spine.
 */
export function PosWorkspace() {
  const { business, membership } = useActiveBusiness()
  const locale = useLocale()
  const context = useEmployeeSessionStore((s) => s.context)
  const { data: location } = useDefaultLocation()
  const { data: openShift, isLoading: shiftLoading } = useOpenShift(location?.id)
  const summary = useShiftCashSummary(openShift?.id)
  const { data: config } = usePosConfig()
  const { data: held } = useHeldBaskets()

  const lines = useCartStore((s) => s.lines)
  const removeLine = useCartStore((s) => s.removeLine)
  const reset = useCartStore((s) => s.reset)
  const subtotal = cartSubtotal(lines)

  const lock = useLockSession()
  const endSession = useEndSession()
  const holdBasket = useHoldBasket()
  const gate = useAuthorizationGate()

  const [panel, setPanel] = useState<PanelKey>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [openShiftOpen, setOpenShiftOpen] = useState(false)
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [safeDropOpen, setSafeDropOpen] = useState(false)

  // Scanning is disabled while anything owns the screen, so a scan can't drop
  // an item into the basket behind an open dialog.
  const scanIdle =
    !paymentOpen &&
    !panel &&
    !openShiftOpen &&
    !closeShiftOpen &&
    !expenseOpen &&
    !safeDropOpen &&
    !mobileCartOpen
  const { feedback: scanFeedback } = useScanToBasket(scanIdle)

  const drawerCash = summary.data?.drawerCash ?? new Decimal(openShift?.opening_float ?? '0')
  const operatorName = context?.display_name ?? membership?.display_name ?? 'Operator'
  // Off means gone, not greyed: a till that offers Hold and then refuses is
  // worse than one that never offered it.
  const tablesEnabled = config?.tables_enabled ?? false
  // A table IS a held order — it is an open ticket somebody comes back to.
  // Offering held baskets alongside it would give a restaurant two parallel
  // ways to park the same thing, which is how a ticket goes missing.
  const holdEnabled = (config?.allow_hold_resume ?? true) && !tablesEnabled
  const heldCount = holdEnabled ? (held ?? []).length : 0

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
    toast({ title: 'Sale cleared' })
  }

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

  async function hold() {
    if (lines.length === 0) return
    try {
      await holdBasket.mutateAsync({
        lines,
        label: `${lines.length} item${lines.length === 1 ? '' : 's'} · ${subtotal.toFixed(2)}`,
        shiftId: openShift?.id ?? null,
      })
      reset()
      toast({ title: 'Sale held', description: 'Pick it up again from Held orders.' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't hold that",
        description: toReadableError(error),
      })
    }
  }

  async function requestSafeDrop() {
    const grant = await gate.request('safe_drop', { shiftId: openShift?.id ?? null })
    if (!grant?.granted) return
    setSafeDropOpen(true)
  }

  useRegistryShortcuts(
    {
      onPay: () => lines.length > 0 && setPaymentOpen(true),
      onHold: () => holdEnabled && void hold(),
      onResume: () => holdEnabled && setPanel('held'),
      onPettyCash: () => openShift && setExpenseOpen(true),
      onSafeDrop: () => void requestSafeDrop(),
      onShift: () => setPanel('shift'),
      onClear: () => void clearBasket(),
    },
    scanIdle,
  )

  const navGroups: WorkspaceNavGroup[] = useMemo(
    () => [
      {
        items: [
          { label: 'Sell', icon: ShoppingCart, active: true, onClick: () => setPanel(null) },
          ...(holdEnabled
            ? [
                {
                  label: 'Held orders',
                  icon: PauseCircle,
                  badge: heldCount,
                  onClick: () => setPanel('held'),
                },
              ]
            : []),
          { label: 'Recent sales', icon: History, onClick: () => setPanel('history') },
        ],
      },
      {
        title: 'This till',
        items: [
          {
            label: openShift ? 'My shift' : 'Open a shift',
            icon: Clock,
            onClick: () => setPanel('shift'),
          },
          { label: 'Cash drawer', icon: Banknote, onClick: () => setPanel('cash') },
          { label: operatorName, icon: UserRound, onClick: () => setPanel('profile') },
        ],
      },
    ],
    [heldCount, holdEnabled, openShift, operatorName],
  )

  return (
    <>
      <WorkspaceShell
        id="pos"
        groups={navGroups}
        brand={
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-primary-foreground">
              <ScanLine className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.9375rem] font-bold text-text-primary">
                Point of sale
              </span>
            </span>
          </>
        }
        context={
          <div className="rounded-2xl bg-background p-3">
            <p className="type-eyebrow">Selling at</p>
            <p className="mt-1 truncate text-sm font-bold text-text-primary">
              {business?.name ?? 'This shop'}
            </p>
            <p className="type-meta mt-0.5 truncate">
              {context?.terminal_name ?? location?.name ?? 'This device'}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={`size-2 shrink-0 rounded-full ${openShift ? 'bg-success' : 'bg-warning'}`}
                aria-hidden="true"
              />
              <span className="type-meta truncate">
                {shiftLoading ? 'Checking shift…' : openShift ? 'Shift open' : 'No shift open'}
              </span>
            </div>
          </div>
        }
        footer={
          context ? (
            <button
              type="button"
              onClick={() => lock.mutate()}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-background px-3 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              <Lock className="size-4 shrink-0 text-icon" aria-hidden="true" />
              <span className="truncate">Lock screen</span>
            </button>
          ) : undefined
        }
        topBar={
          <WorkspaceTopBar
            title={operatorName}
            subtitle={
              context
                ? ROLE_LABELS[context.role]
                : membership
                  ? ROLE_LABELS[membership.role]
                  : undefined
            }
          >
            <WorkspaceTool
              icon={Clock}
              label={openShift ? 'Shift' : 'No shift open'}
              tone={openShift ? 'neutral' : 'warning'}
              onClick={() => setPanel('shift')}
            />
            {holdEnabled && (
              <WorkspaceTool
                icon={PauseCircle}
                label="Held orders"
                badge={heldCount}
                onClick={() => setPanel('held')}
              />
            )}
            <WorkspaceTool icon={Banknote} label="Cash drawer" onClick={() => setPanel('cash')} />
            <WorkspaceTool icon={History} label="Recent sales" onClick={() => setPanel('history')} />
            <WorkspaceTool icon={UserRound} label="Operator" onClick={() => setPanel('profile')} />
          </WorkspaceTopBar>
        }
      >
        {/* No shift, no drawer — say it once, here, with the one action that
            fixes it. It is a strip rather than a blocker because card and
            transfer sales are still perfectly valid without a cash drawer. */}
        {!openShift && !shiftLoading && (
          <div className="flex flex-wrap items-center gap-3 bg-tint-warning px-4 py-2.5 sm:px-6">
            <p className="min-w-0 flex-1 text-sm font-medium text-tint-warning-foreground">
              No shift is open, so cash sales won't be attached to a drawer.
            </p>
            <Button size="sm" onClick={() => setOpenShiftOpen(true)}>
              <Clock className="size-3.5" /> Open shift
            </Button>
          </div>
        )}

        {/* A restaurant does not sell out of a basket, it sells out of a
            table. `tables_enabled` therefore replaces the selling surface
            outright rather than adding a panel to it — the same product
            browser and the same complete_sale underneath. */}
        {tablesEnabled ? (
          <div className="h-full min-h-0">
            <RestaurantFloor showImages={config?.show_product_images ?? true} />
          </div>
        ) : (
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            {scanFeedback && (
              <div className="px-4 pt-3 sm:px-6">
                <ScanStrip feedback={scanFeedback} />
              </div>
            )}
            <div className="min-h-0 flex-1">
              {/* Every one of these comes from business_pos_config — changing
                  a switch in Settings changes this screen. */}
              <PosProductGrid
                showImages={config?.show_product_images ?? true}
                view={config?.product_view ?? 'grid'}
                categoryFirst={config?.category_first ?? false}
                barcodeFirst={config?.barcode_first ?? true}
                variantsEnabled={config?.variants_enabled ?? false}
              />
            </div>
          </div>

          <div className="hidden w-[22rem] shrink-0 lg:block xl:w-[24rem]">
            <PosCart
              onCharge={() => setPaymentOpen(true)}
              onRemoveLine={voidLine}
              onClear={clearBasket}
            />
          </div>
        </div>
        )}

        {/* Tablet/phone: the cart is a sheet behind a persistent summary bar. */}
        {!tablesEnabled && lines.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 bg-surface p-3 shadow-e3 lg:hidden">
            <Button
              className="h-14 w-full justify-between text-base"
              onClick={() => setMobileCartOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="size-5" />
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </span>
              <Money value={subtotal} />
            </Button>
          </div>
        )}
      </WorkspaceShell>

      <WorkspacePanel
        open={mobileCartOpen}
        title="Current sale"
        onClose={() => setMobileCartOpen(false)}
      >
        <PosCart
          onCharge={() => {
            setMobileCartOpen(false)
            setPaymentOpen(true)
          }}
          onRemoveLine={voidLine}
          onClear={clearBasket}
        />
      </WorkspacePanel>

      <ShiftPanel
        open={panel === 'shift'}
        onClose={() => setPanel(null)}
        openShift={openShift}
        shiftLoading={shiftLoading}
        drawerCash={drawerCash}
        summary={summary}
        timezone={business?.timezone ?? 'UTC'}
        locale={locale}
        onOpenShift={() => {
          setPanel(null)
          setOpenShiftOpen(true)
        }}
        onCloseShift={() => {
          setPanel(null)
          setCloseShiftOpen(true)
        }}
      />

      {panel === 'held' && <HeldBasketsDialog onClose={() => setPanel(null)} />}

      <CashPanel
        open={panel === 'cash'}
        onClose={() => setPanel(null)}
        hasShift={!!openShift}
        drawerCash={drawerCash}
        onPettyCash={() => {
          setPanel(null)
          setExpenseOpen(true)
        }}
        onSafeDrop={() => {
          setPanel(null)
          void requestSafeDrop()
        }}
      />

      <HistoryPanel open={panel === 'history'} onClose={() => setPanel(null)} />

      <ProfilePanel
        open={panel === 'profile'}
        onClose={() => setPanel(null)}
        name={operatorName}
        role={context ? ROLE_LABELS[context.role] : membership ? ROLE_LABELS[membership.role] : ''}
        terminal={context?.terminal_name ?? location?.name ?? null}
        hasSession={!!context}
        onHold={() => {
          setPanel(null)
          void hold()
        }}
        canHold={holdEnabled && lines.length > 0}
        holdEnabled={holdEnabled}
        onLock={() => lock.mutate()}
        onSignOut={() => endSession.mutate()}
      />

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
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
          onHandover={() => setOpenShiftOpen(true)}
        />
      )}

      {gate.pending && <ManagerPinModal pending={gate.pending} onResolve={gate.resolvePending} />}
    </>
  )
}

function ShiftPanel({
  open,
  onClose,
  openShift,
  shiftLoading,
  drawerCash,
  summary,
  timezone,
  locale,
  onOpenShift,
  onCloseShift,
}: {
  open: boolean
  onClose: () => void
  openShift: { id: string; opened_at: string; opening_float: string } | null | undefined
  shiftLoading: boolean
  drawerCash: Decimal
  summary: ReturnType<typeof useShiftCashSummary>
  timezone: string
  locale: string
  onOpenShift: () => void
  onCloseShift: () => void
}) {
  return (
    <WorkspacePanel
      open={open}
      title="My shift"
      description="Your drawer only — never the whole business."
      onClose={onClose}
      footer={
        openShift ? (
          <Button variant="outline" className="w-full" onClick={onCloseShift}>
            Close shift / handover
          </Button>
        ) : (
          <Button className="w-full" onClick={onOpenShift} disabled={shiftLoading}>
            <Clock className="size-4" /> Open shift
          </Button>
        )
      }
    >
      {!openShift && !shiftLoading && (
        <div className="rounded-2xl bg-background p-6 text-center">
          <IconBadge tone="warning" size="xl" className="mx-auto">
            <Clock />
          </IconBadge>
          <p className="type-heading mt-3">No shift open</p>
          <p className="type-body mt-1">
            Open one to start tracking this drawer. Card and transfer sales work either way.
          </p>
        </div>
      )}

      {openShift && (
        <div className="space-y-2">
          <p className="type-meta">
            Open since {formatDateTime(openShift.opened_at, timezone, locale)}
          </p>

          <StatRow label="Opening float" value={<Money value={openShift.opening_float} />} />
          <StatRow
            label="Cash taken"
            value={
              summary.isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <Money value={summary.data?.cashIn ?? '0'} />
              )
            }
          />
          <StatRow
            label="Card & transfer"
            value={
              summary.isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <Money value={summary.data?.bankIn ?? '0'} />
              )
            }
          />
          <StatRow
            label="Paid out / dropped"
            value={
              summary.isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <Money value={summary.data?.cashOut ?? '0'} />
              )
            }
          />

          <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-tint-accent px-4 py-3">
            <span className="text-sm font-semibold text-tint-accent-foreground">
              Expected in drawer
            </span>
            <span className="text-lg font-bold tabular-nums text-tint-accent-foreground">
              <Money value={drawerCash} />
            </span>
          </div>
        </div>
      )}
    </WorkspacePanel>
  )
}

function CashPanel({
  open,
  onClose,
  hasShift,
  drawerCash,
  onPettyCash,
  onSafeDrop,
}: {
  open: boolean
  onClose: () => void
  hasShift: boolean
  drawerCash: Decimal
  onPettyCash: () => void
  onSafeDrop: () => void
}) {
  return (
    <WorkspacePanel
      open={open}
      title="Cash drawer"
      description="Money in and out of this till."
      onClose={onClose}
    >
      <div className="rounded-2xl bg-background p-4">
        <p className="type-meta">Expected in drawer</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-text-primary">
          <Money value={drawerCash} />
        </p>
      </div>

      {!hasShift && (
        <p className="type-meta mt-3">
          These need an open shift — cash movements have to belong to a drawer someone is
          accountable for.
        </p>
      )}

      <div className="mt-4 space-y-2">
        <PanelAction
          icon={Receipt}
          title="Petty cash"
          body="Pay a small expense out of the drawer."
          onClick={onPettyCash}
          disabled={!hasShift}
        />
        <PanelAction
          icon={Vault}
          title="Safe drop"
          body="Move cash out of the till into the safe. Needs approval."
          onClick={onSafeDrop}
          disabled={!hasShift}
        />
      </div>
    </WorkspacePanel>
  )
}

/**
 * Recent sales, on the till.
 *
 * A cashier reprinting a receipt should never be sent into the finance module
 * to find it — that is a different job, a different mental model, and on most
 * shop floors a permission they do not have.
 */
function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useTodaysSales(open)

  return (
    <WorkspacePanel
      open={open}
      title="Recent sales"
      description="Today, at this till."
      onClose={onClose}
    >
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (data ?? []).length === 0 && (
        <p className="type-body py-8 text-center">No sales yet today.</p>
      )}

      <ul className="space-y-2">
        {(data ?? []).map((sale) => (
          <li key={sale.id}>
            <a
              href={`/sales/${sale.id}`}
              className="flex min-w-0 items-center gap-3 rounded-2xl bg-background p-3 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {sale.sale_number ?? 'Sale'}
                </p>
                <p className="type-meta truncate">
                  {sale.item_count} item{sale.item_count === '1' ? '' : 's'}
                </p>
              </div>
              {sale.status !== 'completed' && <Badge variant="danger">Voided</Badge>}
              <span className="shrink-0 text-sm font-bold tabular-nums text-text-primary">
                <Money value={sale.grand_total} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  )
}

function ProfilePanel({
  open,
  onClose,
  name,
  role,
  terminal,
  hasSession,
  onHold,
  canHold,
  holdEnabled,
  onLock,
  onSignOut,
}: {
  open: boolean
  onClose: () => void
  name: string
  role: string
  terminal: string | null
  hasSession: boolean
  onHold: () => void
  canHold: boolean
  holdEnabled: boolean
  onLock: () => void
  onSignOut: () => void
}) {
  return (
    <WorkspacePanel open={open} title="Operator" onClose={onClose}>
      <div className="flex items-center gap-3 rounded-2xl bg-background p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-primary text-base font-bold text-primary-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="type-heading truncate">{name}</p>
          <p className="type-meta truncate">
            {[role, terminal].filter(Boolean).join(' · ') || 'Signed in'}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {holdEnabled && (
          <PanelAction
            icon={PauseCircle}
            title="Hold this sale"
            body="Park the basket and start a new one."
            onClick={onHold}
            disabled={!canHold}
          />
        )}
        {hasSession && (
          <>
            <PanelAction
              icon={Lock}
              title="Lock screen"
              body="Step away. Your basket stays."
              onClick={onLock}
            />
            <PanelAction
              icon={LogOut}
              title="Sign out of this till"
              body="Hand over to another operator."
              onClick={onSignOut}
            />
          </>
        )}
      </div>
    </WorkspacePanel>
  )
}

function PanelAction({
  icon: Icon,
  title,
  body,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-background p-3.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-45 disabled:hover:bg-background"
    >
      <IconBadge tone="accent" size="lg">
        <Icon />
      </IconBadge>
      <span className="min-w-0 flex-1">
        <span className="type-heading block truncate">{title}</span>
        <span className="type-meta block">{body}</span>
      </span>
    </button>
  )
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-background px-4 py-2.5 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  )
}
