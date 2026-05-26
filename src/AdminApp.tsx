import { useState } from 'react'
import { Routes, Route, NavLink, Link } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import { useUIStore } from './store/useUIStore'
import { Icon, PlateMark } from './lib/specui'
import type { IconName } from './lib/specui'
import ReportsPage from './pages/admin/ReportsPage'
import CompaniesReportPage from './pages/admin/CompaniesReportPage'

function TopBar() {
  const { user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const [menu, setMenu] = useState(false)
  const initials = (user?.fullName || user?.email || 'A').slice(0, 2).toUpperCase()
  return (
    <header className="border-b border-line bg-surface/95 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-[60px] flex items-center justify-between gap-6">
        <Link to="/admin" className="flex items-center gap-2.5 shrink-0">
          <PlateMark />
          <span className="font-display text-[22px] font-semibold tracking-tight">orexi</span>
          <span className="hidden lg:inline-block ml-2 px-2 py-0.5 rounded-xs bg-accent-soft text-accent text-[10px] font-semibold uppercase tracking-[0.1em]">Admin</span>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/company" className="text-[12.5px] font-medium text-ink-soft hover:text-ink">{lang === 'el' ? 'Πίνακας εταιρείας' : 'Company panel'}</Link>
          <div className="flex items-center bg-bg rounded-sm p-0.5 border border-line">
            {(['el', 'en'] as const).map((c) => (
              <button key={c} onClick={() => setLang(c)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] rounded-xs transition ${lang === c ? 'bg-surface shadow-sm text-ink' : 'text-ink-faint hover:text-ink'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-[11.5px] font-semibold">{initials}</button>
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

function SideNav() {
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const items: { to: string; label: string; icon: IconName; end?: boolean }[] = [
    { to: '/admin', label: L('Dashboard', 'Dashboard'), icon: 'home', end: true },
    { to: '/admin/companies', label: L('Σύγκριση εταιρειών', 'Companies'), icon: 'office' },
    { to: '/admin/reports', label: L('Αναφορές (όλες)', 'Reports (all)'), icon: 'chart' },
  ]
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13.5px] transition ${isActive ? 'bg-brand-soft text-brand font-semibold' : 'text-ink-soft hover:text-ink hover:bg-brand-soft/40'}`
  return (
    <aside className="w-[232px] shrink-0 border-r border-line bg-surface/60 sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto">
      <div className="px-4 py-5 border-b border-line">
        <div className="text-[11px] text-ink-faint uppercase tracking-[0.08em] font-semibold mb-1.5">{L('Super Admin', 'Super Admin')}</div>
      </div>
      <nav className="px-2 py-3 space-y-0.5">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={cls}>
            {({ isActive }) => (<>
              <span className={isActive ? 'text-brand' : 'text-ink-faint'}><Icon name={i.icon} /></span>
              <span className="flex-1">{i.label}</span>
            </>)}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function AdminDashboardPlaceholder() {
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  return (
    <section className="p-8 max-w-[1100px] space-y-4">
      <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Super Admin', 'Super Admin')}</h1>
      <p className="text-ink-soft">{L('Επιλέξτε «Σύγκριση εταιρειών» από το πλάι για τη συνοπτική εικόνα όλων.', 'Pick "Companies" on the side for the cross-company view.')}</p>
    </section>
  )
}

export default function AdminApp() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <TopBar />
      <div className="flex flex-1">
        <SideNav />
        <main className="flex-1 min-w-0">
          <Routes>
            <Route index element={<AdminDashboardPlaceholder />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="companies" element={<CompaniesReportPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
