import { Link } from 'react-router-dom'
import { useUIStore } from '../store/useUIStore'
import { makeTr } from '../lib/translations'

export default function NotFound() {
  const { lang } = useUIStore()
  const t = makeTr(lang)
  return (
    <main className="cf-container">
      <h1>{t('notFound')}</h1>
      <p>
        <Link to="/">{t('home')}</Link>
      </p>
    </main>
  )
}
