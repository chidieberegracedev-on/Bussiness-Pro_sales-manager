import { BadgeCheck, Clock, Package, Repeat, ShieldQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SupplierVerification } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Trust, shown as facts rather than a score.
 *
 * There is deliberately no composite "4.6 supplier rating". A single number
 * invented before there is real network activity behind it is worse than no
 * number: it looks authoritative, it can't be argued with, and a buyer will
 * make a purchasing decision on it. Until the network has transactions, a
 * business gets the raw indicators and draws its own conclusion.
 */

export function VerificationBadge({
  verification,
  className,
}: {
  verification: SupplierVerification
  className?: string
}) {
  if (verification === 'verified') {
    return (
      <Badge variant="success" className={className}>
        <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
      </Badge>
    )
  }
  if (verification === 'pending') {
    return (
      <Badge variant="warning" className={className}>
        <Clock className="size-3.5" aria-hidden="true" /> Verification pending
      </Badge>
    )
  }
  if (verification === 'rejected') {
    return (
      <Badge variant="danger" className={className}>
        <ShieldQuestion className="size-3.5" aria-hidden="true" /> Not verified
      </Badge>
    )
  }
  return (
    <Badge variant="muted" className={className}>
      <ShieldQuestion className="size-3.5" aria-hidden="true" /> Not verified
    </Badge>
  )
}

export interface TrustFacts {
  completed_orders?: number | null
  fulfillment_rate?: string | null
  avg_response_minutes?: number | null
  repeat_customers?: number | null
}

export function TrustIndicators({
  facts,
  className,
  compact,
}: {
  facts: TrustFacts
  className?: string
  compact?: boolean
}) {
  const items: { icon: typeof Package; label: string; value: string }[] = []

  if (facts.completed_orders != null && facts.completed_orders > 0) {
    items.push({
      icon: Package,
      label: 'orders completed',
      value: String(facts.completed_orders),
    })
  }
  if (facts.fulfillment_rate != null) {
    items.push({
      icon: BadgeCheck,
      label: 'fulfilled',
      value: `${Number(facts.fulfillment_rate).toFixed(0)}%`,
    })
  }
  if (facts.avg_response_minutes != null) {
    items.push({
      icon: Clock,
      label: 'to reply',
      value: formatMinutes(facts.avg_response_minutes),
    })
  }
  if (facts.repeat_customers != null && facts.repeat_customers > 0) {
    items.push({
      icon: Repeat,
      label: 'repeat buyers',
      value: String(facts.repeat_customers),
    })
  }

  if (items.length === 0) {
    // Say so rather than showing an empty row. A new supplier having no
    // history is information; a blank space is not.
    return (
      <p className={cn('text-xs text-text-muted', className)}>
        No trading history on the network yet
      </p>
    )
  }

  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {items.map((item) => (
        <li
          key={item.label}
          className="inline-flex min-w-0 items-center gap-1 text-xs text-text-secondary"
        >
          <item.icon className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="font-medium text-text-primary">{item.value}</span>
          {!compact && <span className="truncate">{item.label}</span>}
        </li>
      ))}
    </ul>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}
