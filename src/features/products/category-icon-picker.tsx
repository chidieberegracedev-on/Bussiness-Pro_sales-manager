import { useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  CATEGORY_ICONS,
  ICON_GROUPS,
  isEmojiOnly,
  resolveCategoryIcon,
  searchCategoryIcons,
  type CategoryIcon,
} from '@/features/products/category-icons'
import { cn } from '@/lib/utils'

/**
 * The category icon a business has chosen, rendered at a consistent size.
 * Categories without one are not a broken state — they simply have no glyph,
 * and the layout must not shift because of it.
 */
export function CategoryIconGlyph({
  icon,
  className,
}: {
  icon: string | null | undefined
  className?: string
}) {
  const glyph = resolveCategoryIcon(icon)
  if (!glyph) return null
  return (
    <span aria-hidden className={cn('inline-block leading-none', className)}>
      {glyph}
    </span>
  )
}

/**
 * The curated icon picker.
 *
 * Search is the primary interaction, not a filter bolted onto a grid: the set is
 * large on purpose (a picker that lacks your category is a picker you abandon),
 * and scrolling three hundred glyphs to find "plumbing" is not browsing, it is
 * hunting. Typing an emoji directly is accepted too — the curated set is a
 * shortcut, never a ceiling on what a shop is allowed to sell.
 */
export function CategoryIconPicker({
  value,
  onChange,
  disabled,
  disabledReason,
  triggerLabel = 'Icon',
}: {
  value: string | null
  onChange: (key: string | null) => void
  disabled?: boolean
  disabledReason?: string
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchCategoryIcons(query), [query])
  const typedEmoji = isEmojiOnly(query) ? query.trim() : null

  // Group only while browsing. Once the user is searching, ranked order is the
  // useful order and re-grouping would scatter the best matches back apart.
  const grouped = useMemo(() => {
    if (query.trim()) return null
    const map = new Map<string, CategoryIcon[]>()
    for (const group of ICON_GROUPS) map.set(group, [])
    for (const icon of CATEGORY_ICONS) map.get(icon.group)?.push(icon)
    return [...map.entries()].filter(([, icons]) => icons.length > 0)
  }, [query])

  const glyph = resolveCategoryIcon(value)

  function choose(key: string | null) {
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  if (disabled) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled className="h-10 w-14 shrink-0 text-lg">
          {glyph ?? '🏷️'}
        </Button>
        {disabledReason && <p className="type-meta max-w-xs">{disabledReason}</p>}
      </div>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-14 shrink-0 text-lg"
          aria-label={glyph ? `${triggerLabel}: change` : `Choose an ${triggerLabel.toLowerCase()}`}
        >
          {glyph ?? <span className="text-sm font-medium text-text-muted">{triggerLabel}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[22rem] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-icon-muted" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search icons — bread, plumbing, salon…"
              aria-label="Search icons"
              className="h-9 pl-8 pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-icon-muted hover:text-icon-strong"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {typedEmoji && (
            <IconButton
              icon={typedEmoji}
              label="Use this emoji"
              selected={value === typedEmoji}
              onClick={() => choose(typedEmoji)}
              wide
            />
          )}

          {grouped
            ? grouped.map(([group, icons]) => (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="type-eyebrow mb-1.5 px-1">{group}</p>
                  <IconGrid icons={icons} value={value} onChoose={choose} />
                </div>
              ))
            : results.length > 0 && <IconGrid icons={results} value={value} onChoose={choose} />}

          {!grouped && results.length === 0 && !typedEmoji && (
            <div className="px-2 py-6 text-center">
              <p className="type-body">No icon matches “{query}”.</p>
              <p className="type-meta mt-1">
                Type an emoji instead and it will be offered here — the list is a shortcut, not a
                limit.
              </p>
            </div>
          )}
        </div>

        {value && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => choose(null)}
            >
              <X className="size-4" /> Remove icon
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function IconGrid({
  icons,
  value,
  onChoose,
}: {
  icons: CategoryIcon[]
  value: string | null
  onChoose: (key: string) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {icons.map((icon) => (
        <IconButton
          key={icon.key}
          icon={icon.emoji}
          label={icon.label}
          selected={value === icon.key}
          onClick={() => onChoose(icon.key)}
        />
      ))}
    </div>
  )
}

function IconButton({
  icon,
  label,
  selected,
  onClick,
  wide,
}: {
  icon: string
  label: string
  selected: boolean
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The glyph is decorative; the title is the accessible name, so an
      // icon-only button is never announced as an unlabelled button.
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-center rounded-lg border text-xl transition-colors',
        wide ? 'mb-3 h-10 w-full gap-2 text-base' : 'aspect-square',
        selected
          ? 'border-accent bg-tint-accent'
          : 'border-transparent hover:border-border hover:bg-surface-muted',
      )}
    >
      <span aria-hidden>{icon}</span>
      {wide && <span className="text-sm font-medium text-text-secondary">{label}</span>}
    </button>
  )
}
