import * as React from 'react'
import { Input } from '@/components/ui/input'

export interface QuantityInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {}

export const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>((props, ref) => {
  return <Input ref={ref} type="text" inputMode="decimal" autoComplete="off" {...props} />
})
QuantityInput.displayName = 'QuantityInput'
