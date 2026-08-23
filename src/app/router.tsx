import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireBusiness, RequireGuest, RequireRole } from '@/app/guards'
import { AppShell } from '@/components/layout/app-shell'
import { SignInPage } from '@/features/auth/sign-in'
import { SignUpPage } from '@/features/auth/sign-up'
import { AuthCallbackPage } from '@/features/auth/auth-callback'
import { OnboardingPage } from '@/features/business/onboarding'
import { SelectBusinessPage } from '@/features/business/select-business'
import { SettingsLayout } from '@/features/settings/settings-layout'
import { SettingsIndexRedirect } from '@/features/settings/settings-index-redirect'
import { SettingsBusinessPage } from '@/features/business/settings-business'
import { SettingsAppearancePage } from '@/features/business/settings-appearance'
import { SettingsCategoriesPage } from '@/features/products/settings-categories'
import { ProductListPage } from '@/features/products/product-list'
import { CreateProductPage } from '@/features/products/create-product'
import { ProductDetailPage } from '@/features/products/product-detail'
import { EditProductPage } from '@/features/products/edit-product'
import { LowStockPage } from '@/features/inventory/low-stock'
import { MovementHistoryPage } from '@/features/inventory/movement-history'
import { PosPage } from '@/features/pos/pos-page'
import { SalesListPage } from '@/features/sales/sales-list'
import { SaleDetailPage } from '@/features/sales/sale-detail'
import { DashboardPage } from '@/features/analytics/dashboard'
import { SalesReportPage } from '@/features/analytics/sales-report'
import { ProductPerformancePage } from '@/features/analytics/product-performance'
import { InventoryIntelligencePage } from '@/features/analytics/inventory-intelligence'
import { SupplierListPage } from '@/features/procurement/supplier-list'
import { SupplierFormPage } from '@/features/procurement/supplier-form'
import { SupplierDetailPage } from '@/features/procurement/supplier-detail'
import { PurchaseOrdersListPage } from '@/features/procurement/po-list'
import { CreatePurchaseOrderPage } from '@/features/procurement/create-purchase-order'
import { PurchaseOrderDetailPage } from '@/features/procurement/po-detail'
import { ReceiveGoodsPage } from '@/features/procurement/receive-goods'
import { RestockPage } from '@/features/procurement/restock-page'
import { PurchaseHistoryPage } from '@/features/procurement/purchase-history'
import { FinanceDashboardPage } from '@/features/finance/finance-dashboard'
import { CashbookPage } from '@/features/finance/cashbook-page'
import { ExpensesPage } from '@/features/finance/expenses-page'
import { ExpenseCategoriesPage } from '@/features/finance/expense-categories-page'
import { ShiftsListPage } from '@/features/finance/shifts-list-page'
import { OpenShiftPage } from '@/features/finance/open-shift-page'
import { CloseShiftPage } from '@/features/finance/close-shift-page'
import { DictionaryPage } from '@/features/help/dictionary-page'
import { CalculatorPage } from '@/features/help/calculator-page'
import { LearningCenterPage } from '@/features/help/learning-page'
import { SettingsTerminalsPage } from '@/features/control/settings-terminals'
import { CountSessionsPage } from '@/features/counting/count-sessions-page'
import { CountSessionPage } from '@/features/counting/count-session-page'
import { PrintQueuePage } from '@/features/print/print-queue-page'
import { MarketplacePage } from '@/features/network/marketplace-page'
import { MarketplaceHomePage } from '@/features/network/marketplace-home-page'
import { SupplierProfilePage } from '@/features/network/supplier-profile-page'
import { MyStorefrontPage } from '@/features/network/my-storefront-page'
import { ConnectionsPage } from '@/features/network/connections-page'
import { MyListingsPage } from '@/features/network/my-listings-page'
import { ListingDetailPage } from '@/features/network/listing-detail-page'
import { MessagesPage, ThreadPage } from '@/features/network/messages-page'
import { EmployeeDirectoryPage } from '@/features/control/employee-directory'
import { SettingsPermissionsPage } from '@/features/control/settings-permissions'
import { LiveShiftsPage } from '@/features/control/live-shifts-page'
import { ShiftDiscrepanciesPage } from '@/features/control/discrepancies-page'
import { ActivityLogPage } from '@/features/control/activity-page'
import { ExceptionsPage } from '@/features/control/exceptions-page'
import {
  WorkspaceGate,
  RequireManagementAccess,
  RegistryRoute,
} from '@/features/control/workspace-router'
import { NotFoundPage } from '@/features/misc/not-found'

const MANAGE_ROLES = ['owner', 'manager'] as const
// Inventory staff work the backroom catalog and purchasing alongside management.
const BACKROOM_ROLES = ['owner', 'manager', 'inventory_staff'] as const

export function AppRouter() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
      </Route>

      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/select-business" element={<SelectBusinessPage />} />

        <Route element={<RequireBusiness />}>
          {/* The Registry is its own full-screen workspace — no management shell. */}
          <Route path="/registry" element={<RegistryRoute />} />

          {/* Everything below is the management workspace. WorkspaceGate sends a
              PIN-unlocked cashier to the Registry instead. */}
          <Route element={<WorkspaceGate />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/sales" element={<SalesListPage />} />
            <Route path="/sales/:id" element={<SaleDetailPage />} />

            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />

            <Route element={<RequireRole roles={[...BACKROOM_ROLES]} />}>
              <Route path="/products/new" element={<CreateProductPage />} />
              <Route path="/products/:id/edit" element={<EditProductPage />} />
              <Route path="/inventory/movements" element={<MovementHistoryPage />} />
              <Route path="/inventory/movements/:variantId" element={<MovementHistoryPage />} />
              {/* Counting is backroom work — same roles as the rest of it. */}
              <Route path="/inventory/counts" element={<CountSessionsPage />} />
              <Route path="/inventory/counts/:id" element={<CountSessionPage />} />
            </Route>

            <Route path="/inventory/low-stock" element={<LowStockPage />} />

            <Route path="/reports/sales" element={<SalesReportPage />} />
            <Route path="/reports/products" element={<ProductPerformancePage />} />
            <Route path="/reports/inventory" element={<InventoryIntelligencePage />} />

            <Route path="/suppliers" element={<SupplierListPage />} />
            <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
            <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
              <Route path="/suppliers/new" element={<SupplierFormPage mode="create" />} />
              <Route path="/suppliers/:id/edit" element={<SupplierFormPage mode="edit" />} />
            </Route>

            <Route path="/purchase-orders" element={<PurchaseOrdersListPage />} />
            <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
            <Route path="/purchase-orders/:id/receive" element={<ReceiveGoodsPage />} />
            <Route element={<RequireRole roles={[...BACKROOM_ROLES]} />}>
              <Route path="/purchase-orders/new" element={<CreatePurchaseOrderPage />} />
              <Route path="/restock" element={<RestockPage />} />
            </Route>

            <Route path="/purchase-history" element={<PurchaseHistoryPage />} />

            {/* The public plane. Discovery is open to anyone who can see
                purchasing; publishing and connecting are owner/manager. */}
            {/* Home is the workspace entry point; the grid moved to /search.
                They were two jobs in one screen and the grid always won. */}
            <Route path="/network" element={<MarketplaceHomePage />} />
            <Route path="/network/search" element={<MarketplacePage />} />
            <Route path="/network/suppliers/:id" element={<SupplierProfilePage />} />
            <Route path="/network/listings/:id" element={<ListingDetailPage />} />
            <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
              <Route path="/network/my-profile" element={<MyStorefrontPage />} />
              <Route path="/network/my-listings" element={<MyListingsPage />} />
              <Route path="/network/connections" element={<ConnectionsPage />} />
              {/* Messaging is a commercial conversation on behalf of the
                  business, so it sits with the other owner/manager screens. */}
              <Route path="/network/messages" element={<MessagesPage />} />
              <Route path="/network/messages/:id" element={<ThreadPage />} />
            </Route>

            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/shifts" element={<ShiftsListPage />} />
            <Route path="/shifts/open" element={<OpenShiftPage />} />
            <Route path="/shifts/:id/close" element={<CloseShiftPage />} />

            <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
              <Route path="/finance" element={<FinanceDashboardPage />} />
              <Route path="/finance/cashbook" element={<CashbookPage />} />
              <Route path="/expenses/categories" element={<ExpenseCategoriesPage />} />
            </Route>

            {/* Operational control — management only, enforced again server-side. */}
            <Route element={<RequireManagementAccess roles={[...MANAGE_ROLES]} />}>
              {/* The employee directory is the identity foundation everything
                  else hangs off, so it lives at the top level, not in Settings. */}
              <Route path="/employees" element={<EmployeeDirectoryPage />} />
              <Route path="/control" element={<Navigate to="/control/live-shifts" replace />} />
              <Route path="/control/live-shifts" element={<LiveShiftsPage />} />
              <Route path="/control/reconciliation" element={<ShiftDiscrepanciesPage />} />
              <Route path="/control/activity" element={<ActivityLogPage />} />
              <Route path="/control/exceptions" element={<ExceptionsPage />} />
            </Route>

            <Route path="/help" element={<Navigate to="/help/learning" replace />} />
            <Route path="/help/learning" element={<LearningCenterPage />} />
            <Route path="/help/dictionary" element={<DictionaryPage />} />
            <Route path="/help/calculator" element={<CalculatorPage />} />

            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsIndexRedirect />} />
              <Route path="appearance" element={<SettingsAppearancePage />} />
              <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
                <Route path="business" element={<SettingsBusinessPage />} />
                <Route path="categories" element={<SettingsCategoriesPage />} />
                <Route path="employees" element={<Navigate to="/employees" replace />} />
                <Route path="terminals" element={<SettingsTerminalsPage />} />
                <Route path="printing" element={<PrintQueuePage />} />
                <Route path="permissions" element={<SettingsPermissionsPage />} />
              </Route>
            </Route>
          </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
