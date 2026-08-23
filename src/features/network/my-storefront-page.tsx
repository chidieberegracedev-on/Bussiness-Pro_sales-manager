import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Store,
  Globe,
  Sparkles,
  Loader2,
  ShieldCheck,
  Info,
  Eye,
  ImagePlus,
  X,
  Link2,
  Lock,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { PageHeader } from '@/components/layout/page-header'
import {
  useMySupplierProfile,
  useMyListings,
  useUploadStorefrontLogo,
  useIncomingConnections,
  usePublishSupplierProfile,
  useUpdateSupplierProfile,
} from '@/features/network/use-network'
import {
  VerificationBadge,
  TrustTierBadge,
  TrustIndicators,
  TIER_LABELS,
  TIER_MEANING,
  normaliseTier,
} from '@/features/network/trust-indicators'
import type { TrustTier } from '@/types/database'
import { useActiveBusiness } from '@/features/business/hooks'
import { toast } from '@/hooks/use-toast'
import { toReadableError } from '@/lib/errors'
import { toUploadErrorMessage } from '@/lib/image-upload'

/**
 * Becoming a public supplier — a deliberate act, but not a waiting room.
 *
 * Every business is private until it publishes. Publishing makes it live the
 * same day (0027): verification raises limits and ranking, it does not decide
 * whether the supplier exists. The old model held a new supplier invisible
 * until an admin got to them, which reads as a broken marketplace rather than
 * a queue, and is how you lose the suppliers you most need to attract.
 */
const TIER_ORDER: TrustTier[] = ['provisional', 'verified', 'trusted', 'preferred']

export function MyStorefrontPage() {
  const { business, role } = useActiveBusiness()
  const { data: profile, isLoading } = useMySupplierProfile()
  const { data: listings } = useMyListings()
  const { data: incoming } = useIncomingConnections()
  const publish = usePublishSupplierProfile()
  const uploadLogo = useUploadStorefrontLogo()
  const update = useUpdateSupplierProfile()

  const canManage = role === 'owner' || role === 'manager'

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [minOrderNote, setMinOrderNote] = useState('')
  const [deliveryAreas, setDeliveryAreas] = useState<string[]>([])
  const [areaDraft, setAreaDraft] = useState('')

  // Radix-free plain inputs, so a straight effect is enough to seed them once
  // the profile arrives.
  useEffect(() => {
    if (!profile) {
      setDisplayName((v) => v || business?.name || '')
      return
    }
    setDisplayName(profile.display_name)
    setDescription(profile.description ?? '')
    setLocation(profile.location_text ?? '')
    setPhone(profile.contact_phone ?? '')
    setEmail(profile.contact_email ?? '')
    setMinOrderNote(profile.min_order_note ?? '')
    setDeliveryAreas((profile.delivery_areas ?? []).filter(Boolean))
  }, [profile, business?.name])

  function addArea() {
    const area = areaDraft.trim()
    // Case-insensitive dedupe: "Lagos" and "lagos" as two chips would look
    // like a bug to the buyer reading them.
    if (!area || deliveryAreas.some((a) => a.toLowerCase() === area.toLowerCase())) {
      setAreaDraft('')
      return
    }
    setDeliveryAreas([...deliveryAreas, area])
    setAreaDraft('')
  }

  async function handlePublish(e: FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    try {
      await publish.mutateAsync({
        displayName: displayName.trim(),
        description: description.trim() || null,
        locationText: location.trim() || null,
      })
      toast({
        title: profile ? 'Storefront updated' : 'Storefront submitted',
        description: profile
          ? 'Your changes are saved.'
          : "You're live — buyers can find you now. Verification comes later and raises your limits.",
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't save your storefront",
        description: toReadableError(error),
      })
    }
  }

  async function saveContact() {
    if (!profile) return
    try {
      await update.mutateAsync({
        id: profile.id,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        min_order_note: minOrderNote.trim() || null,
        delivery_areas: deliveryAreas.length > 0 ? deliveryAreas : null,
      })
      toast({ title: 'Storefront saved' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't save contact details",
        description: toReadableError(error),
      })
    }
  }

  // Published is live. Verification lifts limits and ranking; it is not a gate
  // on existing (0027).
  const live = !!profile?.is_public && profile.verification !== 'rejected'
  const provisional = live && profile?.verification !== 'verified'
  /** Has a storefront but has switched itself off — distinct from never published. */
  const hidden = !!profile && !profile.is_public

  const visibleListings = (listings ?? []).filter((l) => l.availability === 'active').length
  const hiddenListings = (listings ?? []).length - visibleListings
  const connectedCount = (incoming ?? []).filter((c) => c.status === 'accepted').length

  function setVisibility(next: boolean) {
    if (!profile) return
    update.mutate(
      { id: profile.id, is_public: next },
      {
        onSuccess: () =>
          toast({
            title: next ? "You're listed again" : 'Hidden from the network',
            description: next
              ? 'Buyers can find your storefront and your active listings.'
              : 'Your storefront and listings are kept — nobody new can find them.',
          }),
        onError: (error) =>
          toast({
            variant: 'destructive',
            title: "Couldn't change that",
            description: toReadableError(error),
          }),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sell on the network"
        description="Publish a storefront so other businesses can find what you supply. Your own costs, margins, and stock are never part of it."
        actions={
          live && profile ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to={`/network/suppliers/${profile.id}`}>
                  <Eye className="size-4" /> View as buyers see it
                </Link>
              </Button>
              <Button asChild>
                <Link to="/network/my-listings">
                  <Package className="size-4" /> What I sell
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Status first — "am I actually listed?" is the only question this
          screen has to answer unambiguously. */}
      {!isLoading && (
        <NotePanel tone={live ? (provisional ? 'accent' : 'success') : 'neutral'} className="flex items-start gap-3">
          <IconBadge
            tone={live ? (provisional ? 'accent' : 'success') : 'neutral'}
            size="lg"
            className="bg-surface/70"
          >
            {provisional ? <Sparkles /> : live ? <Globe /> : <Lock />}
          </IconBadge>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-text-primary">
              {provisional
                ? 'Live on the network — provisionally active'
                : live
                  ? 'Live on the network'
                  : hidden
                    ? 'Hidden from the network'
                    : 'Your business is private'}
            </p>
            <p className="mt-0.5">
              {provisional
                ? "You're listed and can start selling right now — buyers can find you, see your products, and send you requests. Verification comes later and raises your limits and your position in results; it isn't holding anything up."
                : live
                  ? 'Verified. Other businesses can find your storefront and send you connection requests.'
                  : hidden
                    ? "Your storefront still exists and your listings are kept, but nobody can find you in search or open your page. Turn visibility back on below whenever you're ready."
                    : 'Nobody outside your business can see anything about you. Publishing a storefront is the only thing that changes that, and it only lists the details you fill in below.'}
            </p>
          </div>
        </NotePanel>
      )}

      {/* Visibility. Publishing was a one-way door before this: there was no
          control anywhere in the app that could take a storefront back off the
          network, so the only way to stop being found was to delete every
          listing one at a time. */}
      {profile && (
        <Card elevation="raised" className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5" /> Who can see you
            </CardTitle>
            <CardDescription>
              Being listed is a switch you control, not something you can only do once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  Listed on the network
                </p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {profile.is_public
                    ? 'Any business on the network can find your storefront and your active listings.'
                    : "You're hidden. Existing conversations and connections carry on; new buyers can't find you."}
                </p>
              </div>
              <Switch
                checked={profile.is_public}
                disabled={!canManage || update.isPending}
                onCheckedChange={(next) => setVisibility(next)}
                aria-label="Listed on the network"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <VisibilityStat
                icon={Package}
                value={String(visibleListings)}
                label={`Listing${visibleListings === 1 ? '' : 's'} buyers can see`}
              />
              <VisibilityStat
                icon={Lock}
                value={String(hiddenListings)}
                label={`Hidden or out of stock`}
              />
              <VisibilityStat
                icon={Link2}
                value={String(connectedCount)}
                label={`Connected buyer${connectedCount === 1 ? '' : 's'}`}
              />
            </div>

            {profile.is_public && visibleListings === 0 && (
              <NotePanel tone="warning" className="text-sm">
                Your storefront is listed but has nothing for sale, so a buyer who finds you has
                nothing to act on.{' '}
                <Link to="/network/my-listings" className="font-semibold underline">
                  List a product
                </Link>
                .
              </NotePanel>
            )}
          </CardContent>
        </Card>
      )}

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Your standing
              <TrustTierBadge tier={profile.trust_tier} />
              {profile.verification === 'verified' && (
                <VerificationBadge verification={profile.verification} />
              )}
            </CardTitle>
            <CardDescription>
              Standing is earned by trading well, not by paperwork alone. Buyers see the numbers
              below and judge for themselves — there is no single score.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TrustIndicators facts={profile} />

            <ol className="space-y-2">
              {(['provisional', 'verified', 'trusted', 'preferred'] as TrustTier[]).map((tier) => {
                const reached =
                  TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(normaliseTier(profile.trust_tier))
                return (
                  <li
                    key={tier}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
                      reached ? 'border-border bg-surface-muted/40' : 'border-dashed border-border'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        reached
                          ? 'bg-accent-primary/10 text-accent-primary'
                          : 'bg-surface-muted text-text-muted'
                      }`}
                    >
                      {TIER_ORDER.indexOf(tier) + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">{TIER_LABELS[tier]}</p>
                      <p className="text-xs text-text-secondary">{TIER_MEANING[tier]}</p>
                    </div>
                  </li>
                )
              })}
            </ol>

            <p className="text-xs text-text-muted">
              Higher tiers raise your order limits and where you appear in results. Those limits
              take effect alongside protected payment, which is still being built.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{profile ? 'Storefront details' : 'Publish a storefront'}</CardTitle>
          <CardDescription>
            This is everything buyers see. Nothing else about your business is shared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Appearance first — the logo and the name are what a buyer sees
              before they read anything, and until now neither the logo nor the
              delivery areas could be set at all: both columns were rendered on
              the public storefront with no way to fill them in. */}
          {profile && (
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl bg-background p-4">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tint-accent text-lg font-bold text-tint-accent-foreground">
                {profile.logo_url ? (
                  <img src={profile.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  (profile.display_name[0] ?? '?').toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="type-heading">Storefront logo</p>
                <p className="type-meta mt-0.5">
                  Shown next to your name everywhere on the network. Published — anyone with the
                  link can see it.
                </p>
              </div>
              <label
                className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted ${
                  uploadLogo.isPending ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                {uploadLogo.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {profile.logo_url ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={!canManage || uploadLogo.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    uploadLogo.mutate(
                      { profileId: profile.id, file },
                      {
                        onError: (error) =>
                          toast({
                            variant: 'destructive',
                            title: "Couldn't upload that",
                            description: toUploadErrorMessage(error),
                          }),
                      },
                    )
                  }}
                />
              </label>
            </div>
          )}

          <form onSubmit={handlePublish} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="sf-name">
                Business name buyers will see
              </label>
              <Input
                id="sf-name"
                className="mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="The name buyers will recognise"
                disabled={!canManage}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="sf-desc">
                What you supply
              </label>
              <textarea
                id="sf-desc"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/40 disabled:opacity-50"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What you supply, and where you deliver."
                disabled={!canManage}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="sf-loc">
                Where you're based
              </label>
              <Input
                id="sf-loc"
                className="mt-1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or area"
                disabled={!canManage}
              />
            </div>

            {!canManage && (
              <p className="flex items-start gap-2 text-sm text-text-secondary">
                <Info className="mt-0.5 size-4 shrink-0 text-text-muted" />
                Only an owner or manager can publish or change the storefront.
              </p>
            )}

            <Button type="submit" disabled={!canManage || !displayName.trim() || publish.isPending}>
              {publish.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Store className="size-4" />
              )}
              {profile ? 'Save storefront' : 'Publish storefront'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>How buyers reach you</CardTitle>
            <CardDescription>
              Shown on your public storefront. Leave anything blank you'd rather not publish.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-text-secondary" htmlFor="sf-phone">
                  Phone
                </label>
                <Input
                  id="sf-phone"
                  className="mt-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary" htmlFor="sf-email">
                  Email
                </label>
                <Input
                  id="sf-email"
                  className="mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary" htmlFor="sf-moq">
                Ordering note
              </label>
              <Input
                id="sf-moq"
                className="mt-1"
                value={minOrderNote}
                onChange={(e) => setMinOrderNote(e.target.value)}
                placeholder="e.g. minimum order value, delivery days"
                disabled={!canManage}
              />
            </div>
            {/* Delivery areas are a text[] the public storefront already
                renders as chips — this is the only place they can be set. */}
            <div>
              <span className="text-sm font-medium text-text-secondary">Delivery areas</span>
              <p className="type-meta mt-0.5">
                Where you'll deliver. Buyers filter and judge distance on these.
              </p>

              {deliveryAreas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {deliveryAreas.map((area) => (
                    <span
                      key={area}
                      className="inline-flex items-center gap-1.5 rounded-full bg-tint-accent py-1.5 pl-3 pr-1.5 text-[0.8125rem] font-medium text-tint-accent-foreground"
                    >
                      {area}
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Remove ${area}`}
                          onClick={() => setDeliveryAreas(deliveryAreas.filter((a) => a !== area))}
                          className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-surface"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <Input
                  value={areaDraft}
                  onChange={(e) => setAreaDraft(e.target.value)}
                  placeholder="Add an area and press Enter"
                  aria-label="Add a delivery area"
                  disabled={!canManage}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    // Inside a card, not a form — but Enter in a text input
                    // still submits an enclosing form in some browsers.
                    e.preventDefault()
                    addArea()
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addArea}
                  disabled={!canManage || !areaDraft.trim()}
                >
                  Add
                </Button>
              </div>
            </div>

            <Button variant="outline" onClick={saveContact} disabled={!canManage || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save contact &amp; delivery
            </Button>
          </CardContent>
        </Card>
      )}

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" /> Your products
            </CardTitle>
            <CardDescription>
              A storefront with nothing in it can't be bought from. List what you sell and set a
              price for each quantity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/network/my-listings">
                <Package className="size-4" /> Manage what I sell
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> What stays private
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-text-secondary">
            <li>· What you paid for anything, and what you make on it</li>
            <li>· Your stock levels, sales, and cash position</li>
            <li>· Who your suppliers and customers are</li>
            <li>· Your staff, shifts, and activity history</li>
          </ul>
          <p className="mt-3 text-sm text-text-secondary">
            Buyers see the storefront above and the products you choose to list — nothing else.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function VisibilityStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-background p-3">
      <IconBadge tone="accent" size="md">
        <Icon />
      </IconBadge>
      <div className="min-w-0">
        <p className="text-lg font-bold tabular-nums text-text-primary">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  )
}
