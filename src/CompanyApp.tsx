import { useEffect } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { useUIStore } from './store/useUIStore'
import { useCompanyStore } from './store/useCompanyStore'
import { makeTr } from './lib/translations'
import CompanyDashboard from './pages/company/CompanyDashboard'
import EmployeesPage from './pages/company/EmployeesPage'
import BenefitsPage from './pages/company/BenefitsPage'
import CompanyReportsPage from './pages/company/CompanyReportsPage'
import VendorsPage from './pages/company/VendorsPage'
import SettingsPage from './pages/company/SettingsPage'

function TopBar() {
  const { user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const { companies, selectedId, setSelected } = useCompanyStore()
  const isSuper = user?.role === 'super_admin'

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-surface px-6 py-3">
      <span className="font-display text-xl font-semibold text-brand">Company&nbsp;Fooding</span>

      {/* company switcher */}
      {companies.length > 0 && (
        <div className="ml-2 flex items-center gap-2">
          {isSuper && companies.length > 1 ? (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-line bg-bg px-3 py-1.5 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className="rounded-lg bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
              {companies.find((c) => c.id === selectedId)?.name ?? companies[0]?.name}
            </span>
          )}
        </div>
      )}

      <nav className="ml-auto flex items-center gap-3">
        {isSuper && (
          <NavLink to="/admin" className="text-sm text-ink-soft hover:text-ink">Admin</NavLink>
        )}
        <button
          type="button"
          onClick={() => setLang(lang === 'el' ? 'en' : 'el')}
          className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-soft hover:bg-bg"
        >
          {lang === 'el' ? 'EN' : 'EL'}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-bg"
        >
          {makeTr(lang)('logout')}
        </button>
      </nav>
    </header>
  )
}

function SideNav() {
  const { lang } = useUIStore()
  const t = makeTr(lang)
  const link = ({ isActive }: { isActive: boolean }) =>
    [
      'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-bg hover:text-ink',
    ].join(' ')

  const L = (el: string, en: string) => (lang === 'el' ? el : en)

  return (
    <aside className="w-56 shrink-0 border-r border-line bg-surface px-3 py-4">
      <nav className="grid gap-1">
        <NavLink to="/company" end className={link}>{L('Πίνακας', 'Dashboard')}</NavLink>
        <NavLink to="/company/reports" className={link}>{L('Αναφορές', 'Reports')}</NavLink>
        <NavLink to="/company/employees" className={link}>{t('employees')}</NavLink>
        <NavLink to="/company/benefits" className={link}>{t('benefits')}</NavLink>
        <NavLink to="/company/vendors" className={link}>{L('Συνεργάτες', 'Vendors')}</NavLink>
        <NavLink to="/company/settings" className={link}>{L('Ρυθμίσεις', 'Settings')}</NavLink>
      </nav>
    </aside>
  )
}

export default function CompanyApp() {
  const { session } = useAuthStore()
  const { setCompanies, loaded } = useCompanyStore()

  // Load the company list (for the switcher / scoping) once we have a session.
  useEffect(() => {
    if (!session?.access_token || loaded) return
    ;(async () => {
      try {
        const r = await fetch('/api/cf-companies', {
          headers: { authorization: `Bearer ${session.access_token}` },
        })
        if (!r.ok) return
        const d = await r.json()
        setCompanies(d.companies ?? [])
      } catch { /* ignore */ }
    })()
  }, [session?.access_token, loaded, setCompanies])

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopBar />
      <div className="flex flex-1">
        <SideNav />
        <main className="flex-1 px-6 py-6">
          <Routes>
            <Route index element={<CompanyDashboard />} />
            <Route path="reports" element={<CompanyReportsPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="benefits" element={<BenefitsPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/company" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
