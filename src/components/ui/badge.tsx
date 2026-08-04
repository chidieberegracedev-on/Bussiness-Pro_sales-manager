import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // shrink-0 + whitespace-nowrap: a badge is a fixed token, not a paragraph.
  // Without these it collapses under flex pressure and stacks its icon above
  // its label, which is what it was doing inside product cards.
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-text-primary',
        // Soft tinted pills, not gray-on-gray. Each pairs a designed tint
        // surface with a foreground that meets AA on it — `bg-success/15
        // text-success` did neither reliably.
        accent: 'border-transparent bg-tint-accent text-tint-accent-foreground',
        success: 'border-transparent bg-tint-success text-tint-success-foreground',
        warning: 'border-transparent bg-tint-warning text-tint-warning-foreground',
        danger: 'border-transparent bg-tint-danger text-tint-danger-foreground',
        info: 'border-transparent bg-tint-info text-tint-info-foreground',
        muted: 'border-transparent bg-surface-muted text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
