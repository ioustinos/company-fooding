import { useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useUIStore } from '../store/useUIStore'
import { makeTr } from '../lib/translations'

type LocState = { from?: string }

export default function LoginPage() {
  const { session, signIn, loading, error } = useAuthStore()
  const { lang } = useUIStore()
  const t = makeTr(lang)
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as LocState | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (session) return <Navigate to={from} replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await signIn(email, password)
      nav(from, { replace: true })
    } catch {
      // error shown from store
    }
  }

  return (
    <div className="cf-container" style={{ maxWidth: 400 }}>
      <h1>{t('login')}</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          {t('email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>

        {error && <div style={{ color: 'var(--cf-danger)' }}>{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? t('loading') : t('login')}
        </button>
      </form>
    </div>
  )
}
