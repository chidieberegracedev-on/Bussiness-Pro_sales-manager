import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Info, ArrowRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDictionaryTerm } from '@/features/help/use-dictionary'
import { useHelpHints } from '@/features/help/help-hints-store'
import { cn } from '@/lib/utils'

interface TermProps {
  /** Dictionary slug, e.g. "cogs" — matches business_dictionary.slug. */
  slug: string
  children: ReactNode
  className?: string
}

/**
 * Wraps a technical term with an optional ⓘ that explains it inline, without
 * leaving the page. Renders children unchanged when the user has turned help
 * hints off (WEB_IMPLEMENTATION §2 — the toggle is mandatory).
 */
export function Term({ slug, children, className }: TermProps) {
  const hintsOn = useHelpHints()
  const entry = useDictionaryTerm(slug)

  if (!hintsOn || !entry) return <>{children}</>

  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      {children}
      <InfoPopover slug={slug} term={entry.term} shortDef={entry.short_def} />
    </span>
  )
}

function InfoPopover({
  slug,
  term,
  shortDef,
}: {
  slug: string
  term: string
  shortDef: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What does ${term} mean?`}
          className="inline-flex size-4 shrink-0 translate-y-0.5 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3.5" align="start">
        <p className="text-sm font-semibold text-text-primary">{term}</p>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{shortDef}</p>
        <Link
          to={`/help/dictionary?term=${slug}`}
          className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline"
        >
          Learn more <ArrowRight className="size-3" />
        </Link>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Standalone ⓘ for cases where the label text is already rendered elsewhere
 * (e.g. a table header that must stay plain text).
 */
export function TermHint({ slug }: { slug: string }) {
  const hintsOn = useHelpHints()
  const entry = useDictionaryTerm(slug)
  if (!hintsOn || !entry) return null
  return <InfoPopover slug={slug} term={entry.term} shortDef={entry.short_def} />
}
