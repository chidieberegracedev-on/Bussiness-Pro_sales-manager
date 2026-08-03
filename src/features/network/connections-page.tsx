import { Link } from 'react-router-dom'
import { Link2, Check, X, Inbox, Send, Store, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import {
  useIncomingConnections,
  useOutgoingConnections,
  useAcceptConnection,
  useDeclineConnection,
  useRevokeConnection,
  useMySupplierProfile,
  CONNECT_LABELS,
} from '@/features/network/use-network'
import { useLocale } from '@/features/auth/use-locale'
import { useActiveBusiness } from '@/features/business/hooks'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import type { ConnectStatus } from '@/types/database'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<ConnectStatus, string> = {
  requested: 'bg-warning/10 text-warning',
  accepted: 'bg-success/10 text-success',
  declined: 'bg-surface-muted text-text-muted',
  revoked: 'bg-surface-muted text-text-muted',
}

/**
 * The bridge, made visible.
 *
 * Connecting is the one action that crosses from the public plane into the
 * private one — accepting a request mints a real supplier in the other
 * business's books. That deserves a screen where both sides can see exactly
 * what has been asked and what was granted, rather than happening invisibly
 * behind a button.
 */
export function ConnectionsPage() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: profile } = useMySupplierProfile()
  const { data: incoming, isLoading: incomingLoading } = useIncomingConnections()
  const { data: outgoing, isLoading: outgoingLoading } = useOutgoingConnections()

  const accept = useAcceptConnection()
  const decline = useDeclineConnection()
  const revoke = useRevokeConnection()

  const pending = (incoming ?? []).filter((c) => c.status === 'requested')
  const handled = (incoming ?? []).filter((c) => c.status !== 'requested')

  function run(
    mutation: { mutate: (id: string, opts: object) => void },
    id: string,
    success: string,
  ) {
    mutation.mutate(id, {
      onSuccess: () => toast({ title: success }),
      onError: (e: unknown) =>
        toast({
          variant: 'destructive',
          title: "That didn't work",
          description: toReadableError(e),
        }),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description="Requests you've sent to suppliers, and requests other businesses have sent to your storefront."
      />

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-5" /> Requests to you
              {pending.length > 0 && (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {pending.length} waiting
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Accepting adds you to their supplier list so they can raise purchase orders with you.
              It does not give them access to anything else.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {incomingLoading && <Skeleton className="h-20 w-full rounded-lg" />}

            {!incomingLoading && pending.length === 0 && handled.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-text-secondary">
                No requests yet. They arrive once your storefront is verified and buyers find you.
              </p>
            )}

            {pending.length > 0 && (
              <ul className="space-y-2">
                {pending.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                      <Link2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        A business wants to buy from you
                      </p>
                      <p className="text-xs text-text-muted">
                        {business &&
                          `Requested ${formatDateTime(row.requested_at, business.timezone, locale)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => run(decline, row.id, 'Request declined')}
                        disabled={decline.isPending}
                      >
                        <X className="size-3.5" /> Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => run(accept, row.id, 'Connected')}
                        disabled={accept.isPending}
                      >
                        {accept.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        Accept
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {handled.length > 0 && (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {handled.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-secondary">Connection request</p>
                      <p className="text-xs text-text-muted">
                        {business &&
                          row.responded_at &&
                          formatDateTime(row.responded_at, business.timezone, locale)}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-5" /> Requests you've sent
          </CardTitle>
          <CardDescription>
            Once a supplier accepts, they appear in your Suppliers list and you can raise a purchase
            order the same way as any other supplier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outgoingLoading && <Skeleton className="h-20 w-full rounded-lg" />}

          {!outgoingLoading && (outgoing ?? []).length === 0 && (
            <EmptyState
              icon={Store}
              title="You haven't connected with anyone yet"
              description="Find suppliers on the network and send a request. They choose whether to accept."
              action={
                <Button asChild>
                  <Link to="/network">Browse the network</Link>
                </Button>
              }
            />
          )}

          {!outgoingLoading && (outgoing ?? []).length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(outgoing ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/network/suppliers/${row.supplier_profile_id}`}
                      className="truncate text-sm font-medium text-text-primary hover:underline"
                    >
                      {row.profile?.display_name ?? 'Supplier'}
                    </Link>
                    <p className="truncate text-xs text-text-muted">
                      {row.profile?.location_text ?? '—'}
                      {business &&
                        ` · ${formatDateTime(row.requested_at, business.timezone, locale)}`}
                    </p>
                  </div>
                  <StatusPill status={row.status} />
                  {row.status === 'accepted' && (
                    <>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/suppliers">
                          Suppliers <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-text-secondary hover:bg-danger/5 hover:text-danger"
                        onClick={() => run(revoke, row.id, 'Disconnected')}
                        disabled={revoke.isPending}
                      >
                        Disconnect
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusPill({ status }: { status: ConnectStatus }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLE[status],
      )}
    >
      {CONNECT_LABELS[status]}
    </span>
  )
}
