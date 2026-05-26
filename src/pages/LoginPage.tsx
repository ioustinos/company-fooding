import { useState } from 'react'
import { useLocation, useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useUIStore } from '../store/useUIStore'
import AuthShell from './auth/AuthShell'

type LocState = { from?: string }

export default function LoginPage() {
  const { session, signIn, sendMagicLink, loading, error } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as LocState | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [magicSent, setMagicSent] = useState(false)

  if (session) return <Navigate to={from} replace />

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await signIn(email, password)
      const role = useAuthStore.getState().user?.role
      const dest = from && from !== '/'
        ? from
        : role === 'super_admin' || role === 'company_admin' || role === 'company_owner'
          ? '/company' : '/'
      nav(dest, { replace: true })
    } catch { /* error from store */ }
  }
  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault()
    try { await sendMagicLink(email); setMagicSent(true) } catch { /* error from store */ }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[40px] leading-[48px] font-semibold">{L('Καλώς ήλθατε πίσω', 'Welcome back')}</h1>
      <p className="text-ink-soft mt-2 mb-8 text-[15px]">
        {L('Συνδεθείτε στο orexi.', 'Sign in to orexi.')}
      </p>

      {mode === 'password' ? (
        <form className="space-y-5" onSubmit={onPasswordSubmit}>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink mb-1.5">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
          </label>
          <div>
            <label className="block">
              <span className="block text-[13px] font-medium text-ink mb-1.5">{L('Κωδικός', 'Password')}</span>
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
            </label>
            <div className="flex items-center justify-end mt-3">
              <Link to="/forgot-password" className="text-[13px] text-brand font-medium hover:underline">{L('Ξεχάσατε τον κωδικό;', 'Forgot password?')}</Link>
            </div>
          </div>
          {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-brand text-white rounded font-semibold text-[14.5px] hover:bg-brand-hover transition disabled:opacity-50">
            {loading ? L('Σύνδεση…', 'Signing in…') : L('Σύνδεση', 'Sign in')}
          </button>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-line"></div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-faint font-semibold">{L('ή', 'or')}</div>
            <div className="flex-1 h-px bg-line"></div>
          </div>
          <button type="button" onClick={() => setMode('magic')}
            className="w-full h-11 bg-surface border border-line rounded font-medium text-[14px] hover:border-ink-soft transition">
            {L('Σύνδεση με σύνδεσμο email', 'Send me a magic link')}
          </button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={onMagicSubmit}>
          {magicSent ? (
            <div className="rounded-md border border-success/40 bg-success/5 px-4 py-4 text-[14px] text-success">
              <div className="font-semibold mb-1">{L('Ελέγξτε το email σας', 'Check your email')}</div>
              <div className="text-[12.5px] text-ink-soft">{L(`Στείλαμε σύνδεσμο σύνδεσης στο ${email}. Πατήστε τον για να μπείτε.`, `We sent a sign-in link to ${email}. Click it to log in.`)}</div>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="block text-[13px] font-medium text-ink mb-1.5">Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
              </label>
              {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full h-11 bg-brand text-white rounded font-semibold text-[14.5px] hover:bg-brand-hover transition disabled:opacity-50">
                {loading ? L('Αποστολή…', 'Sending…') : L('Αποστολή συνδέσμου', 'Send magic link')}
              </button>
            </>
          )}
          <button type="button" onClick={() => { setMode('password'); setMagicSent(false) }}
            className="w-full text-[13px] text-ink-soft hover:text-ink">
            ← {L('Επιστροφή σε κωδικό', 'Back to password')}
          </button>
        </form>
      )}

      <p className="mt-8 text-[12.5px] text-ink-faint">
        {L('Υποστήριξη: ', 'Support: ')}<a href="mailto:info@wecook.gr" className="text-brand hover:underline">info@wecook.gr</a>
      </p>
    </AuthShell>
  )
}
