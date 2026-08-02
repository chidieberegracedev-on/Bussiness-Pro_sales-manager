import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookA, Search, Coins, Package, Receipt, Tag } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, FilteredEmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { useDictionary, type DictionaryEntry } from '@/features/help/use-dictionary'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

const CATEGORY_META: Record<string, { label: string; icon: typeof Coins; className: string }> = {
  money: { label: 'Money', icon: Coins, className: 'text-success bg-success/10' },
  inventory: { label: 'Inventory', icon: Package, className: 'text-info bg-info/10' },
  sales: { label: 'Sales', icon: Receipt, className: 'text-accent-primary bg-accent-primary/10' },
}

export function DictionaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: entries, isLoading, isError, refetch } = useDictionary()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [category, setCategory] = useState<string>('all')
  const [letter, setLetter] = useState<string>('all')

  const focusSlug = searchParams.get('term')
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries ?? []) if (e.category) set.add(e.category)
    return Array.from(set).sort()
  }, [entries])

  const letters = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries ?? []) set.add(e.term[0].toUpperCase())
    return Array.from(set).sort()
  }, [entries])

  const filtered = useMemo(() => {
    let list = entries ?? []
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (e) =>
          e.term.toLowerCase().includes(q) ||
          e.short_def.toLowerCase().includes(q) ||
          e.full_def.toLowerCase().includes(q),
      )
    }
    if (category !== 'all') list = list.filter((e) => e.category === category)
    if (letter !== 'all') list = list.filter((e) => e.term[0].toUpperCase() === letter)
    return list
  }, [entries, debouncedSearch, category, letter])

  // Deep-link from an ⓘ "Learn more": clear filters so the target is visible,
  // then scroll it into view and highlight it briefly.
  useEffect(() => {
    if (!focusSlug || !entries?.length) return
    setSearch('')
    setCategory('all')
    setLetter('all')
    const timer = setTimeout(() => {
      entryRefs.current[focusSlug]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => clearTimeout(timer)
  }, [focusSlug, entries?.length])

  function jumpToTerm(slug: string) {
    setSearchParams({ term: slug })
  }

  const hasFilters = debouncedSearch !== '' || category !== 'all' || letter !== 'all'

  return (
    <div>
      <PageHeader
        title="Business Dictionary"
        description="Plain-language meanings for the terms this app uses — no accounting jargon."
      />

      <Card className="mb-4">
        <CardContent className="space-y-3 pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a term or definition…"
              className="pl-9"
              aria-label="Search the dictionary"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterPill active={category === 'all'} onClick={() => setCategory('all')}>
              <Tag className="size-3.5" /> All topics
            </FilterPill>
            {categories.map((c) => {
              const meta = CATEGORY_META[c]
              const Icon = meta?.icon ?? Tag
              return (
                <FilterPill key={c} active={category === c} onClick={() => setCategory(c)}>
                  <Icon className="size-3.5" /> {meta?.label ?? c}
                </FilterPill>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1">
            <FilterPill small active={letter === 'all'} onClick={() => setLetter('all')}>
              All
            </FilterPill>
            {letters.map((l) => (
              <FilterPill key={l} small active={letter === l} onClick={() => setLetter(l)}>
                {l}
              </FilterPill>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

      {!isLoading && !isError && entries && entries.length === 0 && (
        <EmptyState
          icon={BookA}
          title="The dictionary is empty"
          description="Definitions will appear here once the reference content is loaded."
        />
      )}

      {!isLoading && !isError && entries && entries.length > 0 && filtered.length === 0 && (
        <FilteredEmptyState
          onClear={() => {
            setSearch('')
            setCategory('all')
            setLetter('all')
          }}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <>
          {hasFilters && (
            <p className="mb-3 text-sm text-text-muted">
              {filtered.length} term{filtered.length === 1 ? '' : 's'}
            </p>
          )}
          <div className="space-y-3">
            {filtered.map((entry) => (
              <DictionaryCard
                key={entry.id}
                entry={entry}
                highlighted={entry.slug === focusSlug}
                onJump={jumpToTerm}
                registerRef={(el) => {
                  entryRefs.current[entry.slug] = el
                }}
                allEntries={entries ?? []}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DictionaryCard({
  entry,
  highlighted,
  onJump,
  registerRef,
  allEntries,
}: {
  entry: DictionaryEntry
  highlighted: boolean
  onJump: (slug: string) => void
  registerRef: (el: HTMLDivElement | null) => void
  allEntries: DictionaryEntry[]
}) {
  const meta = entry.category ? CATEGORY_META[entry.category] : undefined
  const Icon = meta?.icon ?? Tag

  const relatedEntries = useMemo(
    () =>
      entry.related
        .map((slug) => allEntries.find((e) => e.slug === slug))
        .filter((e): e is DictionaryEntry => !!e),
    [entry.related, allEntries],
  )

  return (
    <div
      ref={registerRef}
      id={entry.slug}
      className={cn(
        'scroll-mt-6 rounded-xl border bg-card p-5 transition-shadow',
        highlighted ? 'border-accent-primary ring-1 ring-accent-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">{entry.term}</h2>
          <p className="mt-0.5 text-sm font-medium text-text-secondary">{entry.short_def}</p>
        </div>
        {meta && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
              meta.className,
            )}
          >
            <Icon className="size-3" />
            {meta.label}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{entry.full_def}</p>

      {entry.example && (
        <div className="mt-3 rounded-lg border-l-2 border-accent-primary/40 bg-surface-muted/50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Example</p>
          <p className="mt-1 text-sm text-text-secondary">{entry.example}</p>
        </div>
      )}

      {relatedEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Related:</span>
          {relatedEntries.map((related) => (
            <button
              key={related.slug}
              type="button"
              onClick={() => onJump(related.slug)}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
            >
              {related.term}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-all',
        small ? 'min-w-8 justify-center px-2 py-0.5 text-xs' : 'px-3 py-1.5 text-sm',
        active
          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
          : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary',
      )}
    >
      {children}
    </button>
  )
}
