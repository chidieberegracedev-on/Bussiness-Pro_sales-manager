import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Elevation is a role, not a decoration — so a card declares which of the
 * three levels it occupies and never mixes them. A bordered card is flat by
 * definition; a raised card earns its lift from shadow and drops the border.
 * Using both is what made every surface read as the same plane.
 */
const cardVariants = cva('rounded-xl bg-card text-card-foreground', {
  variants: {
    elevation: {
      /** Level 1 — sits on the page, separated by a hairline. The default. */
      flat: 'border border-border',
      /** Level 2 — a grouped section panel: warm tint, no border, no shadow. */
      panel: 'bg-tint-neutral',
      /** Level 3 — genuinely lifted: product cards, the cart, primary panels. */
      raised: 'shadow-e2',
      /** Level 4 — floats above the page. Reserve for overlays and drawers. */
      floating: 'shadow-e3',
    },
  },
  defaultVariants: {
    elevation: 'flat',
  },
})

export interface CardProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ elevation }), className)} {...props} />
  ),
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('type-title', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('type-body', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
}
