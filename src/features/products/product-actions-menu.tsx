import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Pencil, PackagePlus, PackageMinus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useStockDialogStore } from '@/features/inventory/stock-dialog-store'
import { toStockDialogContext, type GroupedProduct } from '@/features/products/types'
import { useActiveBusiness } from '@/features/business/hooks'

export function ProductActionsMenu({ product }: { product: GroupedProduct }) {
  const navigate = useNavigate()
  const { role } = useActiveBusiness()
  const openAddStock = useStockDialogStore((s) => s.openAddStock)
  const openAdjustStock = useStockDialogStore((s) => s.openAdjustStock)
  const canManage = role === 'owner' || role === 'manager'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${product.productName}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => navigate(`/products/${product.productId}`)}>
          View details
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuItem onSelect={() => navigate(`/products/${product.productId}/edit`)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openAddStock(toStockDialogContext(product))}>
              <PackagePlus className="size-4" /> Add stock
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openAdjustStock(toStockDialogContext(product))}>
              <PackageMinus className="size-4" /> Adjust stock
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
