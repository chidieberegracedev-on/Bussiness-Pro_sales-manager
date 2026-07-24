import { formatQuantity, type QuantityInput } from '@/lib/units'
import { useLocale } from '@/features/auth/use-locale'
import { cn } from '@/lib/utils'

export function Quantity({ value, unit, className }: { value: QuantityInput; unit?: string; className?: string }) {
  const locale = useLocale()
  return (
    <span className={cn('tabular-nums', className)}>
      {formatQuantity(value, locale)}
      {unit ? ` ${unit}` : ''}
    </span>
  )
}
