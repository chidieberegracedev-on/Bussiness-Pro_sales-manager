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
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/page-header'
import {
  useMySupplierProfile,
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
  const publish = usePublishSupplierProfile()
  const update = useUpdateSupplierProfile()

  const canManage = role === 'owner' || role === 'manager'

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [minOrderNote, setMinOrderNote] = useState('')

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
  }, [profile, business?.name])

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
      })
      toast({ title: 'Contact details saved' })
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sell on the network"
        description="Publish a storefront so other businesses can find what you supply. Your own costs, margins, and stock are never part of it."
        actions={
          live && profile ? (
            <Button variant="outline" asChild>
              <Link to={`/network/suppliers/${profile.id}`}>
                <Eye className="size-4" /> View as buyers see it
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Status first — "am I actually listed?" is the only question this
          screen has to answer unambiguously. */}
      {!isLoading && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3 ${
            provisional
              ? 'border-accent-primary/30 bg-accent-primary/5'
              : live
                ? 'border-success/30 bg-success/5'
                : 'border-border bg-surface-muted/50'
          }`}
        >
          {provisional ? (
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-primary" />
          ) : live ? (
            <Globe className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <Lock className="mt-0.5 size-4 shrink-0 text-text-muted" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-medium text-text-primary">
              {provisional
                ? 'Live on the network — provisionally active'
                : live
                  ? 'Live on the network'
                  : 'Your business is private'}
            </p>
            <p className="mt-0.5 text-text-secondary">
              {provisional
                ? "You're listed and can start selling right now — buyers can find you, see your products, and send you requests. Verification comes later and raises your limits and your position in results; it isn't holding anything up."
                : live
                  ? 'Verified. Other businesses can find your storefront and send you connection requests.'
                  : 'Nobody outside your business can see anything about you. Publishing a storefront is the only thing that changes that, and it only lists the details you fill in below.'}
            </p>
          </div>
        </div>
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
            <Button variant="outline" onClick={saveContact} disabled={!canManage || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save contact details
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
