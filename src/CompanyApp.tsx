import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { useUIStore } from './store/useUIStore'
import { useCompanyStore } from './store/useCompanyStore'
import { Icon, PlateMark } from './lib/specui'
import type { IconName } from './lib/specui'
import CompanyDashboard from './pages/company/CompanyDashboard'
import EmployeesPage from './pages/company/EmployeesPage'
import EmployeeEditPage from './pages/company/EmployeeEditPage'
import GroupsPage from './pages/company/GroupsPage'
import BenefitsPage from './pages/company/BenefitsPage'
import BenefitEditPage from './pages/company/BenefitEditPage'
import CompanyReportsPage from './pages/company/CompanyReportsPage'
import VendorsPage from './pages/company/VendorsPage'
import VendorDetailPage from './pages/company/VendorDetailPage'
import SettingsPage from './pages/company/SettingsPage'

function TopBar() {
  const { user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const { companies, selectedId, setSelected } = useCompanyStore()
  const isSuper = user?.role === 'super_admin'
  const [menu, setMenu] = useState(false)
  const initials = (user?.fullName || user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <header className="border-b border-line bg-surface/95 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-[60px] flex items-center justify-between gap-6">
        <Link to="/company" className="flex items-center gap-2.5 shrink-0">
          <PlateMark />
          <span className="font-display text-[22px] font-semibold tracking-tight">orexi</span>
          <span className="hidden lg:inline-block ml-2 px-2 py-0.5 rounded-xs bg-accent-soft text-accent text-[10px] font-semibold uppercase tracking-[0.1em]">Beta</span>
        </Link>

        {/* company switcher */}
        {companies.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            {isSuper && companies.length > 1 ? (
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelected(e.target.value)}
                className="rounded border border-line bg-bg px-3 py-1.5 text-[13px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <span className="rounded bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand truncate">
                {companies.find((c) => c.id === selectedId)?.name ?? companies[0]?.name}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {isSuper && (
            <NavLink to="/admin" className="text-[12.5px] font-medium text-ink-soft hover:text-ink">Admin</NavLink>
          )}
          {/* lang segmented toggle */}
          <div className="flex items-center bg-bg rounded-sm p-0.5 border border-line">
            {(['el', 'en'] as const).map((code) => (
              <button key={code} onClick={() => setLang(code)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] rounded-xs transition ${lang === code ? 'bg-surface shadow-sm text-ink' : 'text-ink-faint hover:text-ink'}`}>
                {code}
              </button>
            ))}
          </div>
          {/* avatar + menu */}
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
                  <button onClick={() => void signOut()}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-[13px] text-danger hover:bg-danger/5 rounded-xs">
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

function SideNav() {
  const { lang } = useUIStore()
  const { companies, selectedId } = useCompanyStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const companyName = companies.find((c) => c.id === selectedId)?.name ?? companies[0]?.name ?? '—'

  const groups: { label: string; items: { to: string; label: string; icon: IconName; end?: boolean }[] }[] = [
    { label: L('Επισκόπηση', 'Overview'), items: [
      { to: '/company', label: L('Πίνακας', 'Dashboard'), icon: 'home', end: true },
    ] },
    { label: L('Διαχείριση', 'Management'), items: [
      { to: '/company/benefits', label: L('Παροχές', 'Benefits'), icon: 'wallet' },
      { to: '/company/employees', label: L('Υπάλληλοι', 'Employees'), icon: 'users' },
      { to: '/company/groups', label: L('Ομάδες', 'Groups'), icon: 'office' },
      { to: '/company/vendors', label: L('Συνεργάτες', 'Vendors'), icon: 'handshake' },
    ] },
    { label: L('Οικονομικά', 'Finance'), items: [
      { to: '/company/reports', label: L('Αναφορές', 'Reports'), icon: 'chart' },
    ] },
    { label: L('Ρυθμίσεις', 'Settings'), items: [
      { to: '/company/settings', label: L('Προφίλ εταιρείας', 'Company profile'), icon: 'gear' },
    ] },
  ]

  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13.5px] transition ${isActive ? 'bg-brand-soft text-brand font-semibold' : 'text-ink-soft hover:text-ink hover:bg-brand-soft/40'}`

  return (
    <aside className="w-[232px] shrink-0 border-r border-line bg-surface/60 sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto">
      <div className="px-4 py-5 border-b border-line">
        <div className="text-[11px] text-ink-faint uppercase tracking-[0.08em] font-semibold mb-1.5">{L('Εταιρεία', 'Company')}</div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center text-[13px] font-semibold shrink-0">{companyName.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate">{companyName}</div>
          </div>
        </div>
      </div>
      <nav className="px-2 py-3 space-y-5">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2.5 text-[10.5px] uppercase tracking-[0.09em] text-ink-faint font-semibold mb-1.5">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={cls}>
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-brand' : 'text-ink-faint'}><Icon name={i.icon} /></span>
                      <span className="flex-1">{i.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default function CompanyApp() {
  const { session } = useAuthStore()
  const { setCompanies, loaded } = useCompanyStore()

  useEffect(() => {
    if (!session?.access_token || loaded) return
    ;(async () => {
      try {
        const r = await fetch('/api/cf-companies', { headers: { authorization: `Bearer ${session.access_token}` } })
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
        <main className="flex-1 min-w-0">
          <Routes>
            <Route index element={<CompanyDashboard />} />
            <Route path="reports" element={<CompanyReportsPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/new" element={<EmployeeEditPage />} />
            <Route path="employees/:id" element={<EmployeeEditPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="benefits" element={<BenefitsPage />} />
            <Route path="benefits/new" element={<BenefitEditPage />} />
            <Route path="benefits/:id" element={<BenefitEditPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="vendors/:id" element={<VendorDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/company" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
