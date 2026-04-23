import Header from '../components/layout/Header'
import { useAuthStore } from '../store/useAuthStore'
import { useUIStore } from '../store/useUIStore'
import { makeTr } from '../lib/translations'

export default function EmployeeHome() {
  const { user } = useAuthStore()
  const { lang } = useUIStore()
  const t = makeTr(lang)

  return (
    <>
      <Header />
      <main className="cf-container">
        <h1>{t('home')}</h1>
        <p className="cf-muted">
          {user?.email ?? ''} · {user?.role ?? 'no role yet'}
        </p>
        <p>
          Employee home is a placeholder. This is where the daily benefit balance,
          the redirect to the active vendor voucher, and order history will live.
        </p>
      </main>
    </>
  )
}
