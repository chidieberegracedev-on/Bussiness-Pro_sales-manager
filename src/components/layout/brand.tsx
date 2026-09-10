import { cn } from '@/lib/utils'

/**
 * The Business Pro brand mark — the same glyph the browser tab and the product
 * already use (public/favicon.svg), never a re-drawn logo. Referenced by URL so
 * there is one source of truth for the mark; if it changes, everywhere changes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      className={cn('shrink-0 select-none', className)}
      draggable={false}
    />
  )
}

/** Mark plus wordmark, for the expanded sidebar and any full-brand placement. */
export function BusinessProWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <BrandMark className="size-6" />
      <span className="truncate text-[0.95rem] font-bold tracking-tight text-text-primary">
        Business Pro
      </span>
    </span>
  )
}
