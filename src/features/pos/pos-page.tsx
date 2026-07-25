import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { useCartStore, cartSubtotal } from '@/features/pos/cart-store'
import { ProductPicker } from '@/features/pos/product-picker'
import { CartPanel } from '@/features/pos/cart-panel'
import { PaymentDialog } from '@/features/pos/payment-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Money } from '@/components/money/money'

export function PosPage() {
  const lines = useCartStore((s) => s.lines)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const subtotal = cartSubtotal(lines)

  function handleTakePayment() {
    setMobileCartOpen(false)
    setPaymentOpen(true)
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4 lg:h-[calc(100dvh-6rem)] lg:flex-row">
      <div className="min-h-0 flex-1 lg:flex-[2]">
        <ProductPicker />
      </div>

      {/* Desktop: persistent cart pane */}
      <div className="hidden min-h-0 w-96 shrink-0 rounded-lg border border-border bg-surface p-4 lg:block">
        <CartPanel onTakePayment={handleTakePayment} />
      </div>

      {/* Mobile: sticky summary bar opening a cart sheet */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-3 shadow-lg lg:hidden">
          <Button className="w-full justify-between" size="lg" onClick={() => setMobileCartOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              {lines.length} item{lines.length === 1 ? '' : 's'}
            </span>
            <Money value={subtotal} />
          </Button>
        </div>
      )}

      <Dialog open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <DialogContent className="lg:hidden">
          <DialogHeader>
            <DialogTitle>Cart</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh]">
            <CartPanel onTakePayment={handleTakePayment} />
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  )
}
