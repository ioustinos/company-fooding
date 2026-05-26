import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { useUIStore } from './store/useUIStore'
import { Icon, PlateMark } from './lib/specui'
import EmployeeHomePage from './pages/employee/EmployeeHomePage'
import EmployeeOrdersPage from './pages/employee/EmployeeOrdersPage'
import EmployeeVendorsPage from './pages/employee/EmployeeVendorsPage'
import EmployeeProfilePage from './pages/employee/EmployeeProfilePage'

function TopBar() {
  const { user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const [menu, setMenu] = useState(false)
  const initials = (user?.fullName || user?.email || 'U').slice(0, 2).toUpperCase()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin' || user?.role === 'company_owner'
  return (
    <header className="border-b border-line bg-surface/95 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1100px] mx-auto px-6 h-[60px] flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <PlateMark />
          <span className="font-display text-[22px] font-semibold tracking-tight">orexi</span>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin && (
            <Link to="/company" className="text-[12.5px] font-medium text-ink-soft hover:text-ink">
              {lang === 'el' ? 'Διαχείριση' : 'Admin'}
            </Link>
          )}
          <div className="flex items-center bg-bg rounded-sm p-0.5 border border-line">
            {(['el', 'en'] as const).map((c) => (
              <button key={c} onClick={() => setLang(c)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] rounded-xs transition ${lang === c ? 'bg-surface shadow-sm text-ink' : 'text-ink-faint hover:text-ink'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)}
              className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-[11.5px] font-semibold focus-visible:ring-2 focus-visible:ring-brand">
              {initials}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-surface border border-line rounded-md shadow-lg p-1.5 z-20">
                  <div className="px-2.5 py-2 border-b border-line mb-1">
                    <div className="text-[13px] font-semibold truncate">{user?.fullName || user?.email}</div>
                    <div className="text-[11.5px] text-ink-faint truncate">{user?.email}</div>
                  </div>
                  <button onClick={() => void signOut()} className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-danger hover:bg-danger/5 rounded-xs">
                    <Icon name="logout" /><span>{lang === 'el' ? 'Αποσύνδεση' : 'Sign out'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function SubNav() {
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const items: { to: string; label: string; end?: boolean }[] = [
    { to: '/', label: L('Αρχική', 'Home'), end: true },
    { to: '/orders', label: L('Παραγγελίες', 'Orders') },
    { to: '/vendors', label: L('Καταστήματα', 'Vendors') },
    { to: '/profile', label: L('Προφίλ', 'Profile') },
  ]
  const cls = ({ isActive }: { isActive: boolean }) =>
    `relative px-3 py-3.5 text-[13.5px] font-medium transition ${isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'}`
  return (
    <div className="border-b border-line bg-surface/50">
      <div className="max-w-[1100px] mx-auto px-6 flex items-center gap-1">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={cls}>
            {({ isActive }) => (
              <>
                {i.label}
                {isActive && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand rounded-t" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default function EmployeeApp() {
  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      <SubNav />
      <main>
        <Routes>
          <Route index element={<EmployeeHomePage />} />
          <Route path="orders" element={<EmployeeOrdersPage />} />
          <Route path="vendors" element={<EmployeeVendorsPage />} />
          <Route path="profile" element={<EmployeeProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
