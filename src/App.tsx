import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import EmployeeHome from './pages/EmployeeHome'
import NotFound from './pages/NotFound'
import { RoleGuard } from './components/guards/RoleGuard'

// Code-split the admin + company shells so the employee bundle stays lean.
const AdminApp = lazy(() => import('./AdminApp'))
const CompanyApp = lazy(() => import('./CompanyApp'))

function Loading() {
  return <div style={{ padding: 24 }}>Loading…</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

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
          <RoleGuard allow={['company_owner', 'company_admin']}>
            <Suspense fallback={<Loading />}>
              <CompanyApp />
            </Suspense>
          </RoleGuard>
        }
      />

      <Route
        path="/"
        element={
          <RoleGuard allow={['employee', 'company_owner', 'company_admin', 'super_admin']}>
            <EmployeeHome />
          </RoleGuard>
        }
      />

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}
