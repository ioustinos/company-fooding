import { Routes, Route, NavLink } from 'react-router-dom'
import Header from './components/layout/Header'
import { useUIStore } from './store/useUIStore'
import { makeTr } from './lib/translations'

function CompanyShell({ children }: { children: React.ReactNode }) {
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
            <NavLink to="/company" end style={linkStyle}>Overview</NavLink>
            <NavLink to="/company/employees" style={linkStyle}>{t('employees')}</NavLink>
            <NavLink to="/company/benefits" style={linkStyle}>{t('benefits')}</NavLink>
            <NavLink to="/company/invoices" style={linkStyle}>{t('invoices')}</NavLink>
            <NavLink to="/company/settings" style={linkStyle}>{t('settings')}</NavLink>
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

export default function CompanyApp() {
  return (
    <CompanyShell>
      <Routes>
        <Route index element={<Placeholder title="Company — Overview" />} />
        <Route path="employees" element={<Placeholder title="Employees" />} />
        <Route path="benefits" element={<Placeholder title="Benefits" />} />
        <Route path="invoices" element={<Placeholder title="Invoices" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
      </Routes>
    </CompanyShell>
  )
}
