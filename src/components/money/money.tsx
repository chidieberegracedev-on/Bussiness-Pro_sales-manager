import { formatMoney, type MoneyInput } from '@/lib/money'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { cn } from '@/lib/utils'

/**
 * The only place currency is formatted. No feature component formats
 * currency inline (WEB_IMPLEMENTATION.md §4).
 */
export function Money({ value, className }: { value: MoneyInput; className?: string }) {
  const { business } = useActiveBusiness()
  const locale = useLocale()

  if (!business) return <span className={className}>—</span>

  return (
    <span className={cn('tabular-nums', className)}>
      {formatMoney(value, business.currency_code, business.currency_exponent, locale)}
    </span>
  )
}
