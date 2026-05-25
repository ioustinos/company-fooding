import { Routes, Route, NavLink } from 'react-router-dom'
import Header from './components/layout/Header'
import { useUIStore } from './store/useUIStore'
import { makeTr } from './lib/translations'
import ReportsPage from './pages/admin/ReportsPage'

function AdminShell({ children }: { children: React.ReactNode }) {
  const { lang } = useUIStore()
  const t = makeTr(lang)

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: '6px 10px',
    borderRadius: 6,
    background: isActive ? 'var(--cf-border)' : 'transparent',
  })

  return (
    <>
      <Header />
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
        <aside style={{ padding: 16, borderRight: '1px solid var(--cf-border)' }}>
          <nav style={{ display: 'grid', gap: 6 }}>
            <NavLink to="/admin" end style={linkStyle}>Dashboard</NavLink>
            <NavLink to="/admin/reports" style={linkStyle}>Reports</NavLink>
            <NavLink to="/admin/companies" style={linkStyle}>Companies</NavLink>
            <NavLink to="/admin/vendors" style={linkStyle}>{t('vendors')}</NavLink>
            <NavLink to="/admin/invoices" style={linkStyle}>{t('invoices')}</NavLink>
            <NavLink to="/admin/settings" style={linkStyle}>{t('settings')}</NavLink>
          </nav>
        </aside>
        <main className="cf-container">{children}</main>
      </div>
    </>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="cf-muted">Section scaffolded — implementation lands per the Linear plan.</p>
    </>
  )
}

export default function AdminApp() {
  return (
    <AdminShell>
      <Routes>
        <Route index element={<Placeholder title="Super Admin — Dashboard" />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="companies" element={<Placeholder title="Companies" />} />
        <Route path="vendors" element={<Placeholder title="Vendors" />} />
        <Route path="invoices" element={<Placeholder title="Invoices" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
      </Routes>
    </AdminShell>
  )
}
