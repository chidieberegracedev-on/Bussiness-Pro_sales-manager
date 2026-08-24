import { KeyRound, MonitorSmartphone, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { useActiveBusiness } from '@/features/business/hooks'
import { useEmployeeSessionStore, getTerminalId } from '@/features/control/session-store'
import { ROLE_LABELS } from '@/features/control/roles'

/**
 * The person, not the work.
 *
 * Read-only by design: name, role and permissions are set by an owner or
 * manager on the Employees screen, and letting an operator edit their own role
 * from their own workspace would defeat the control layer entirely. What this
 * page does is tell them what is true about their account and where to go if
 * it is wrong.
 */
export function MyProfilePage() {
  const { business, membership, role: deviceRole } = useActiveBusiness()
  const context = useEmployeeSessionStore((s) => s.context)

  const name = context?.display_name ?? membership?.display_name ?? 'You'
  const role = context?.status === 'active' ? context.role : deviceRole
  const terminalName = context?.terminal_name ?? null
  const isTerminal = !!getTerminalId()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="type-display">My profile</h1>
      <p className="type-body mt-1.5">Who you are on this business, and on this device.</p>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-surface p-5 shadow-e2">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xl font-bold text-primary-foreground">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-title truncate">{name}</h2>
            {role && <Badge variant="accent">{ROLE_LABELS[role]}</Badge>}
          </div>
          <p className="type-meta mt-1 truncate">{business?.name}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Row
          icon={MonitorSmartphone}
          title="This device"
          body={
            terminalName
              ? `Signed in at ${terminalName}.`
              : isTerminal
                ? 'A registered terminal.'
                : 'Not registered as a terminal, so operator sign-in is off here.'
          }
        />
        <Row
          icon={KeyRound}
          title="My PIN"
          body="Stored as a one-way hash — nobody can read it back, including an owner. If you've forgotten it, an owner or manager resets it from the Employees screen."
        />
        <Row
          icon={ShieldCheck}
          title="What I can approve"
          body="Your limits are set by an owner or manager. Actions above them ask for a manager's PIN at the moment you try, and both names are recorded."
        />
      </div>

      <NotePanel tone="neutral" className="mt-4">
        <p className="type-heading">Something wrong here?</p>
        <p className="type-body mt-1">
          Your name, role and limits are managed by an owner or manager — this page can't change
          them, on purpose. Ask them to update it on the Employees screen.
        </p>
      </NotePanel>
    </div>
  )
}

function Row({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl bg-surface p-4 shadow-e1">
      <IconBadge tone="accent" size="lg">
        <Icon />
      </IconBadge>
      <div className="min-w-0">
        <p className="type-heading">{title}</p>
        <p className="type-body mt-0.5">{body}</p>
      </div>
    </div>
  )
}

