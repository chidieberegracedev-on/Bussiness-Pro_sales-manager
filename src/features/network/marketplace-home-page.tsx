import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Inbox,
  Link2,
  MessagesSquare,
  Package,
  Search,
  Store,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMarketplace,
  useMarketplaceCategories,
  useMySupplierProfile,
  useMyListings,
  useIncomingConnections,
  useOutgoingConnections,
  useUnreadMessageCount,
} from '@/features/network/use-network'

/**
 * The workspace entry point.
 *
 * Split out of the marketplace grid because those were two jobs in one screen:
 * "what needs my attention on the network" and "search everything". The grid
 * kept winning, so a pending connection request or an unanswered question sat
 * below a wall of product cards.
 *
 * Everything here reads the public plane only, same as the rest of the
 * workspace.
 */
export function MarketplaceHomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: categories } = useMarketplaceCategories()
  const { products, isLoading } = useMarketplace({})
  const { data: myProfile } = useMySupplierProfile()
  const { data: myListings } = useMyListings()
  const { data: incoming } = useIncomingConnections()
  const { data: outgoing } = useOutgoingConnections()
  const unread = useUnreadMessageCount()

  const pendingIncoming = (incoming ?? []).filter((c) => c.status === 'requested').length
  const connected = (outgoing ?? []).filter((c) => c.status === 'accepted').length
  const liveListings = (myListings ?? []).filter((l) => l.availability === 'active').length
  const supplierCount = new Set(
    products.flatMap((p) => p.suppliers.map((s) => s.supplier_profile_id)),
  ).size

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    navigate(term ? `/network/search?q=${encodeURIComponent(term)}` : '/network/search')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Supplier Network"
        title="Find what you need to buy"
        description="Search the network, compare what suppliers charge at your quantity, and connect with the ones you want to buy from. Your costs, margins and stock stay private throughout."
      />

      {/* The search box IS the page's primary action, so it gets the size and
          the lift rather than sitting in a toolbar. */}
      <form onSubmit={submitSearch} className="mb-4">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-2 pl-5 shadow-e2">
          <Search className="size-5 shrink-0 text-icon" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, suppliers, categories, or SKUs"
            aria-label="Search the supplier network"
            className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="lg" className="shrink-0">
            Search
          </Button>
        </div>
      </form>

      {(categories ?? []).length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {(categories ?? []).slice(0, 10).map((category) => (
            <Link
              key={category}
              to={`/network/search?category=${encodeURIComponent(category)}`}
              className="rounded-full bg-surface px-3.5 py-2 text-[0.8125rem] font-medium text-text-secondary shadow-e1 transition-colors hover:bg-tint-accent hover:text-tint-accent-foreground"
            >
              {category}
            </Link>
          ))}
        </div>
      )}

      {/* What needs attention. Only rendered when there IS something — an
          empty "0 requests, 0 messages" row is noise on every visit. */}
      {(pendingIncoming > 0 || unread > 0) && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {unread > 0 && (
            <AttentionCard
              to="/network/messages"
              icon={MessagesSquare}
              title={`${unread} unanswered message${unread === 1 ? '' : 's'}`}
              body="A buyer or supplier is waiting on a reply."
            />
          )}
          {pendingIncoming > 0 && (
            <AttentionCard
              to="/network/connections"
              icon={Inbox}
              title={`${pendingIncoming} connection request${pendingIncoming === 1 ? '' : 's'}`}
              body="Businesses asking to buy from you."
            />
          )}
        </div>
      )}

      <h2 className="type-title mb-3">Where you stand</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] w-full rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={Package}
              value={String(products.length)}
              label="Products on the network"
              to="/network/search"
            />
            <StatCard icon={Store} value={String(supplierCount)} label="Suppliers listing" to="/network/search" />
            <StatCard
              icon={Link2}
              value={String(connected)}
              label="Connected suppliers"
              to="/network/connections"
            />
            <StatCard
              icon={Tag}
              value={myProfile ? String(liveListings) : '—'}
              label={myProfile ? 'Of your products listed' : 'You are not selling yet'}
              to={myProfile ? '/network/my-listings' : '/network/my-profile'}
            />
          </>
        )}
      </div>

      {/* The selling side, stated once rather than repeated as a banner on
          every marketplace screen. */}
      {!myProfile ? (
        <NotePanel tone="accent" className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="type-heading">Sell to other businesses too</p>
            <p className="type-body mt-1 text-tint-accent-foreground/90">
              Publish a storefront and your products become findable by every buyer on the network.
              You are live the same day — verification raises your limits later, it doesn't hold you
              up.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/network/my-profile">
              <Store className="size-4" /> Set up my storefront
            </Link>
          </Button>
        </NotePanel>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-5 shadow-e2">
          <div className="flex min-w-0 items-center gap-3">
            <IconBadge tone={myProfile.is_public ? 'success' : 'neutral'} size="lg">
              <Store />
            </IconBadge>
            <div className="min-w-0">
              {/* A div, not a p: Badge renders a div, and a div inside a p is
                  invalid HTML that the browser silently re-parents. */}
              <div className="type-heading flex items-center gap-2">
                <span className="truncate">{myProfile.display_name}</span>
                <Badge variant={myProfile.is_public ? 'success' : 'muted'}>
                  {myProfile.is_public ? 'Listed' : 'Hidden'}
                </Badge>
              </div>
              <p className="type-meta mt-0.5">
                {liveListings} product{liveListings === 1 ? '' : 's'} buyers can see
              </p>
            </div>
          </div>
          <Button variant="outline" asChild className="shrink-0">
            <Link to="/network/my-listings">
              Manage what I sell <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

function AttentionCard({
  to,
  icon: Icon,
  title,
  body,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="flex min-w-0 items-start gap-3 rounded-2xl bg-card p-4 shadow-e2 transition-shadow hover:shadow-e3"
    >
      <IconBadge tone="accent" size="lg">
        <Icon />
      </IconBadge>
      <div className="min-w-0 flex-1">
        <p className="type-heading truncate">{title}</p>
        <p className="type-meta mt-0.5">{body}</p>
      </div>
      <ArrowRight className="mt-2 size-4 shrink-0 text-icon-muted" aria-hidden="true" />
    </Link>
  )
}

function StatCard({
  icon: Icon,
  value,
  label,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex min-w-0 items-center gap-3 rounded-2xl bg-card p-4 shadow-e2 transition-shadow hover:shadow-e3"
    >
      <IconBadge tone="accent" size="lg">
        <Icon />
      </IconBadge>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none text-text-primary">{value}</p>
        <p className="type-meta mt-1.5 truncate">{label}</p>
      </div>
    </Link>
  )
}
