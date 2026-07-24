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
import { NotFoundPage } from '@/features/misc/not-found'

const MANAGE_ROLES = ['owner', 'manager'] as const

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
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/products" replace />} />

            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />

            <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
              <Route path="/products/new" element={<CreateProductPage />} />
              <Route path="/products/:id/edit" element={<EditProductPage />} />
              <Route path="/inventory/movements" element={<MovementHistoryPage />} />
              <Route path="/inventory/movements/:variantId" element={<MovementHistoryPage />} />
            </Route>

            <Route path="/inventory/low-stock" element={<LowStockPage />} />

            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsIndexRedirect />} />
              <Route path="appearance" element={<SettingsAppearancePage />} />
              <Route element={<RequireRole roles={[...MANAGE_ROLES]} />}>
                <Route path="business" element={<SettingsBusinessPage />} />
                <Route path="categories" element={<SettingsCategoriesPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
