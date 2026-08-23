import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, MessagesSquare, Package, Send, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconBadge } from '@/components/ui/icon-badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/data/empty-state'
import {
  useNetworkThreads,
  useThreadMessages,
  useSendMessage,
  useMarkThreadRead,
  type NetworkThread,
} from '@/features/network/use-network'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { cn } from '@/lib/utils'

/**
 * Every conversation this business is part of, buying and selling.
 *
 * One list rather than two: from the shop's point of view "someone wants
 * something from me" and "I want something from them" are both just messages
 * waiting for a reply, and splitting them buries whichever tab is quiet.
 */
export function MessagesPage() {
  const { data: threads, isLoading } = useNetworkThreads()

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Questions and replies between your business and suppliers on the network. Nothing here can see either side's costs, stock, or other trading."
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && (threads ?? []).length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Open a supplier or a listing on the network and ask a question — lead time, delivery, or a price at your quantity."
          action={
            <Button asChild>
              <Link to="/network/search">
                <Store className="size-4" /> Browse the network
              </Link>
            </Button>
          }
        />
      )}

      {!isLoading && (threads ?? []).length > 0 && (
        <ul className="space-y-2">
          {(threads ?? []).map((thread) => (
            <li key={thread.id}>
              <ThreadRow thread={thread} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThreadRow({ thread }: { thread: NetworkThread }) {
  const locale = useLocale()
  const unread = thread.unread_count > 0

  return (
    <Link
      to={`/network/messages/${thread.id}`}
      className="flex min-w-0 items-start gap-3 rounded-2xl bg-card p-4 shadow-e2 transition-shadow hover:shadow-e3"
    >
      <IconBadge tone={unread ? 'accent' : 'neutral'} size="lg">
        <Store />
      </IconBadge>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p
            className={cn(
              'truncate text-text-primary',
              unread ? 'font-bold' : 'font-semibold',
            )}
          >
            {thread.counterparty_name}
          </p>
          <Badge variant={thread.i_am_buyer ? 'muted' : 'info'}>
            {thread.i_am_buyer ? 'You asked' : 'They asked'}
          </Badge>
          {unread && <Badge variant="accent">{thread.unread_count} new</Badge>}
        </div>

        {thread.listing_label && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-text-muted">
            <Package className="size-3 shrink-0" /> {thread.listing_label}
          </p>
        )}

        <p
          className={cn(
            'mt-1 truncate text-sm',
            unread ? 'text-text-primary' : 'text-text-secondary',
          )}
        >
          {thread.last_message_preview ?? 'No messages yet'}
        </p>
      </div>

      {thread.last_message_at && (
        <span className="shrink-0 text-xs text-text-muted">
          {formatRelativeTime(thread.last_message_at, locale)}
        </span>
      )}
    </Link>
  )
}

/** One conversation. */
export function ThreadPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const locale = useLocale()
  const { business } = useActiveBusiness()
  const { data: threads } = useNetworkThreads()
  const { data: messages, isLoading } = useThreadMessages(id)
  const send = useSendMessage()
  const markRead = useMarkThreadRead()

  const [body, setBody] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const thread = (threads ?? []).find((t) => t.id === id) ?? null

  // Opening the conversation is reading it. Fired once per thread rather than
  // on every poll, or a 15-second refetch would restamp forever.
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id || markedRef.current === id) return
    markedRef.current = id
    markRead.mutate(id)
    // markRead is a stable mutation object from react-query; including it
    // would re-run this on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  function submit() {
    if (!id || !body.trim()) return
    const text = body
    setBody('')
    send.mutate(
      { threadId: id, body: text },
      {
        onError: (e) => {
          // Put the text back rather than losing what they typed.
          setBody(text)
          toast({
            variant: 'destructive',
            title: "Couldn't send that",
            description: toReadableError(e),
          })
        },
      },
    )
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 pb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/network/messages')}>
          <ArrowLeft className="size-4" /> Messages
        </Button>
        {thread && (
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-text-primary">{thread.counterparty_name}</p>
            {thread.i_am_buyer && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/network/suppliers/${thread.supplier_profile_id}`}>Storefront</Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {thread?.listing_label && (
        <div className="mb-3 flex shrink-0 items-center gap-2 rounded-xl bg-tint-accent px-3.5 py-2 text-sm text-tint-accent-foreground">
          <Package className="size-4 shrink-0" />
          <span className="min-w-0 truncate">About {thread.listing_label}</span>
          {thread.listing_id && (
            <Link
              to={`/network/listings/${thread.listing_id}`}
              className="ml-auto shrink-0 font-semibold hover:underline"
            >
              View
            </Link>
          )}
        </div>
      )}

      {/* The transcript sits on the page, so it needs a surface that differs
          from the page — `bg-background` here is the page colour and the pane
          vanishes, leaving bubbles floating in space. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-surface-muted/60 p-4">
        {isLoading && <Skeleton className="h-16 w-2/3 rounded-2xl" />}

        {!isLoading && (messages ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">
            {thread
              ? 'No messages in this conversation yet.'
              : "This conversation isn't available — it may belong to another business, or it may have been removed."}
          </p>
        )}

        {!isLoading &&
          (messages ?? []).map((message) => {
            const mine = message.sender_business_id === business?.id
            return (
              <div key={message.id} className={cn('flex', mine && 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 shadow-e1 sm:max-w-[70%]',
                    mine ? 'bg-accent-primary text-primary-foreground' : 'bg-surface',
                  )}
                >
                  {!mine && message.sender_name && (
                    <p className="text-xs font-semibold text-text-secondary">
                      {message.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-line break-words text-sm">{message.body}</p>
                  <p
                    className={cn(
                      'mt-1 text-[11px]',
                      mine ? 'text-primary-foreground/70' : 'text-text-muted',
                    )}
                  >
                    {formatDateTime(message.created_at, business?.timezone ?? 'UTC', locale)}
                  </p>
                </div>
              </div>
            )
          })}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex shrink-0 items-end gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Write a reply"
          aria-label="Your reply"
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention
            // everyone already has in their fingers.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button onClick={submit} disabled={!body.trim() || send.isPending}>
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send
        </Button>
      </div>
    </div>
  )
}
