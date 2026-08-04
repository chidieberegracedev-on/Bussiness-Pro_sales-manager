import { ShieldCheck, Info } from 'lucide-react'
import { IconBadge, NotePanel } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

/**
 * ESCROW IS NOT IMPLEMENTED. This is a placeholder, by decision.
 *
 * The marketplace design calls for payment held until delivery is confirmed,
 * with inspection windows, milestone releases for partial deliveries, and
 * dispute handling that freezes only the disputed amount. None of that exists
 * here — there is no fund-holding, no release, no milestone, no dispute logic
 * anywhere in the codebase or the schema. It is a dedicated future phase,
 * pending a payment-provider decision.
 *
 * What this component does is state the CURRENT truth to a buyer: payment is
 * arranged directly with the supplier, and the platform is not standing behind
 * it. That matters more than the missing feature. A "Buyer Protection Enabled"
 * badge over a payment nobody is protecting is not an incomplete feature — it
 * is a false claim that would cost someone real money, and it is exactly the
 * kind of thing that gets shipped when a placeholder is written optimistically.
 *
 * When escrow ships, this becomes the live indicator. Until then it says
 * "coming", and it says what happens today.
 */
export function BuyerProtectionNotice({ className }: { className?: string }) {
  return (
    // A tinted note, not another white box. This is an aside about how money
    // moves; giving it the same surface as the cards around it is what made it
    // disappear into the page.
    <NotePanel tone="info" className={cn('flex items-start gap-3', className)}>
      <IconBadge tone="info" size="md" className="mt-0.5 bg-surface/70">
        <ShieldCheck />
      </IconBadge>
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
          Payment protection
          <span className="rounded-full bg-surface/70 px-2 py-0.5 text-xs font-medium">
            Coming soon
          </span>
        </p>
        <p className="mt-1 text-tint-info-foreground/90">
          Payment is arranged directly between you and the supplier for now — the same as any
          supplier you already deal with. Held payment, delivery confirmation and dispute handling
          are being built and are not available yet.
        </p>
      </div>
    </NotePanel>
  )
}

/**
 * The payment-method slot. One option today, and it says so plainly rather
 * than showing a disabled "Escrow" radio that implies it is nearly ready.
 */
export function PaymentMethodSlot({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-text-secondary">How you'll pay</p>
      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-medium text-text-primary">Direct payment</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          You settle with the supplier on your own terms, and record it in your books as usual.
        </p>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Info className="mt-0.5 size-3 shrink-0" />
        Protected payment held until delivery is confirmed is a planned addition, not a current
        option.
      </p>
    </div>
  )
}
