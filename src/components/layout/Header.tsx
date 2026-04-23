import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { makeTr } from '../../lib/translations'

export default function Header() {
  const { user, signOut } = useAuthStore()
  const { lang, setLang } = useUIStore()
  const t = makeTr(lang)

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        borderBottom: '1px solid var(--cf-border)',
      }}
    >
      <Link to="/" style={{ fontWeight: 600 }}>
        {t('appName')}
      </Link>

      <nav style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
        {user?.role === 'super_admin' && <Link to="/admin">{t('admin')}</Link>}
        {(user?.role === 'company_owner' || user?.role === 'company_admin') && (
          <Link to="/company">{t('company')}</Link>
        )}

        <button
          type="button"
          onClick={() => setLang(lang === 'el' ? 'en' : 'el')}
          aria-label="Toggle language"
        >
          {lang === 'el' ? 'EN' : 'EL'}
        </button>

        {user && (
          <button type="button" onClick={() => void signOut()}>
            {t('logout')}
          </button>
        )}
      </nav>
    </header>
  )
}
