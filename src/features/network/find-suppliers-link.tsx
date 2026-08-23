import { Link } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { useVariantCanonical } from '@/features/network/use-network'

/**
 * Closes the loop: low stock → the shared catalog → suppliers who sell it.
 *
 * Renders nothing unless the variant is linked to a canonical product, because
 * without that link there is no honest way to say "these suppliers sell this"
 * — only "these suppliers sell something with a similar name", which is the
 * guesswork the catalog exists to remove.
 */
export function FindSuppliersLink({
  variantId,
  className,
}: {
  variantId: string
  className?: string
}) {
  const { data: canonical } = useVariantCanonical(variantId)
  if (!canonical) return null

  return (
    <Link
      to={`/network/search?product=${canonical.id}`}
      className={className}
      title={`Find suppliers offering ${canonical.name}`}
    >
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline">
        <Globe className="size-3.5" /> Find suppliers
      </span>
    </Link>
  )
}
