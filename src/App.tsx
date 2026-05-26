import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import NotFound from './pages/NotFound'
import { RoleGuard } from './components/guards/RoleGuard'
import { useAuthStore } from './store/useAuthStore'
import { PlateMark } from './lib/specui'

// Code-split the admin + company + employee shells so each role gets a lean bundle.
const AdminApp = lazy(() => import('./AdminApp'))
const CompanyApp = lazy(() => import('./CompanyApp'))
const EmployeeApp = lazy(() => import('./EmployeeApp'))

function Loading() {
  return <div style={{ padding: 24 }}>Loading…</div>
}

function BootSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="flex items-center gap-2.5 opacity-70">
        <PlateMark />
        <span className="font-display text-[22px] font-semibold tracking-tight">orexi</span>
      </div>
    </div>
  )
}

export default function App() {
  const hydrated = useAuthStore((s) => s.hydrated)
  // Don't render routes until the initial auth check is done — otherwise a
  // brand-new magic-link / recovery URL fragment hasn't been picked up yet
  // and RoleGuard would wrongly bounce the user to /login.
  if (!hydrated) return <BootSplash />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/admin/*"
        element={
          <RoleGuard allow={['super_admin']}>
            <Suspense fallback={<Loading />}>
              <AdminApp />
            </Suspense>
          </RoleGuard>
        }
      />

      <Route
        path="/company/*"
        element={
          <RoleGuard allow={['company_owner', 'company_admin', 'super_admin']}>
            <Suspense fallback={<Loading />}>
              <CompanyApp />
            </Suspense>
          </RoleGuard>
        }
      />

      <Route
        path="/*"
        element={
          <RoleGuard allow={['employee', 'company_owner', 'company_admin', 'super_admin']}>
            <Suspense fallback={<Loading />}>
              <EmployeeApp />
            </Suspense>
          </RoleGuard>
        }
      />

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
