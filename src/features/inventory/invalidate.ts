import type { QueryClient } from '@tanstack/react-query'

/** Every place cached inventory data can appear, after a stock movement writes. */
export function invalidateInventoryQueries(queryClient: QueryClient, productId: string) {
  queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })
  queryClient.invalidateQueries({ queryKey: ['product-list'] })
  queryClient.invalidateQueries({ queryKey: ['low-stock'] })
  queryClient.invalidateQueries({ queryKey: ['movements'] })
  queryClient.invalidateQueries({ queryKey: ['has-movements'] })
}
