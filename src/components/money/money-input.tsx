import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useActiveBusiness } from '@/features/business/hooks'

export interface MoneyInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {}

/**
 * A plain decimal-string input for money. Value is kept as a string end to
 * end — parsed with Decimal.js on submit, never as a JS number (BR-7.1).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(({ className, ...props }, ref) => {
  const { business } = useActiveBusiness()

  return (
    <div className="relative">
      {business && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-text-muted">
          {business.currency_code}
        </span>
      )}
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(business && 'pl-14', className)}
        {...props}
      />
    </div>
  )
})
MoneyInput.displayName = 'MoneyInput'
