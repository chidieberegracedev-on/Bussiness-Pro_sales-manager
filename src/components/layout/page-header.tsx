import type { ReactNode } from 'react'

/**
 * The page title block. `type-display` is the largest step in the scale and
 * nothing else on a screen may use it — that exclusivity is what makes a page
 * title read as a page title rather than as one more heading.
 *
 * `eyebrow` carries a breadcrumb-ish parent ("Supplier Network"), so a nested
 * workspace can say where it sits without a separate breadcrumb bar.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string
  description?: string
  eyebrow?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="type-eyebrow mb-2">{eyebrow}</div>}
        <h1 className="type-display">{title}</h1>
        {description && <p className="type-body mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
