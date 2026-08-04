import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * A circular (or squircle) badge holding a single icon, on a tinted fill.
 *
 * Exists because the app had drifted into one shape: every icon sat in a gray
 * rounded square the same size and radius as the card around it, so nothing
 * read as a different kind of thing. A circle on a soft tint is instantly a
 * *marker*; a squircle is a *container*. The tints come from the shared token
 * set, so a tone here matches the pill, panel and chart line using the same
 * tone elsewhere.
 */
const iconBadgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        accent: 'bg-tint-accent text-tint-accent-foreground',
        secondary: 'bg-tint-secondary text-tint-secondary-foreground',
        success: 'bg-tint-success text-tint-success-foreground',
        warning: 'bg-tint-warning text-tint-warning-foreground',
        danger: 'bg-tint-danger text-tint-danger-foreground',
        info: 'bg-tint-info text-tint-info-foreground',
        neutral: 'bg-surface-muted text-text-secondary',
        /** Solid — for the one marker on a screen that should carry weight. */
        solid: 'bg-primary text-primary-foreground',
      },
      shape: {
        circle: 'rounded-full',
        squircle: 'rounded-xl',
      },
      size: {
        sm: 'size-7 [&>svg]:size-3.5',
        md: 'size-9 [&>svg]:size-[1.125rem]',
        lg: 'size-11 [&>svg]:size-5',
        xl: 'size-14 [&>svg]:size-6',
      },
    },
    defaultVariants: {
      tone: 'accent',
      shape: 'circle',
      size: 'md',
    },
  },
)

export interface IconBadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof iconBadgeVariants> {}

export function IconBadge({ className, tone, shape, size, ...props }: IconBadgeProps) {
  return <span className={cn(iconBadgeVariants({ tone, shape, size }), className)} {...props} />
}

/**
 * A gently tinted note — the "this is an aside, not another card" surface.
 * No border: the tint alone carries the distinction, and stacking a border on
 * a tinted panel is the borders-and-shadows mistake in another form.
 */
const notePanelVariants = cva('rounded-xl p-4', {
  variants: {
    tone: {
      accent: 'bg-tint-accent text-tint-accent-foreground',
      success: 'bg-tint-success text-tint-success-foreground',
      warning: 'bg-tint-warning text-tint-warning-foreground',
      danger: 'bg-tint-danger text-tint-danger-foreground',
      info: 'bg-tint-info text-tint-info-foreground',
      neutral: 'bg-tint-neutral text-text-secondary',
    },
  },
  defaultVariants: { tone: 'info' },
})

export interface NotePanelProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof notePanelVariants> {}

export function NotePanel({ className, tone, ...props }: NotePanelProps) {
  return <div className={cn(notePanelVariants({ tone }), className)} {...props} />
}

export { iconBadgeVariants, notePanelVariants }
