// /reset-password — landed via the link in the Supabase recovery email.
//
// Supabase's detectSessionInUrl (default in @supabase/supabase-js v2) auto-
// handles the access_token in the URL fragment and signs the user in
// temporarily so we can call updateUser({ password }). Once they submit a
// new password, we redirect them into the app (which the router then routes
// per role).

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useUIStore } from '../store/useUIStore'
import { supabase } from '../lib/supabase'
import AuthShell from './auth/AuthShell'

export default function ResetPasswordPage() {
  const { updatePassword, loading, error } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const nav = useNavigate()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [localErr, setLocalErr] = useState<string | null>(null)

  // Check whether the recovery token landed us in a temporary session.
  // Supabase auto-processes the URL fragment on import; getSession() reflects it.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (alive) setLinked(Boolean(data.session))
    })()
    return () => { alive = false }
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalErr(null)
    if (pwd.length < 8) { setLocalErr(L('Ο κωδικός πρέπει να είναι τουλάχιστον 8 χαρακτήρες.', 'Password must be at least 8 characters.')); return }
    if (pwd !== confirm) { setLocalErr(L('Οι κωδικοί δεν ταιριάζουν.', 'Passwords do not match.')); return }
    try {
      await updatePassword(pwd)
      setDone(true)
      // Route the now-signed-in user into the app.
      setTimeout(() => {
        const role = useAuthStore.getState().user?.role
        nav(role === 'super_admin' || role === 'company_admin' || role === 'company_owner' ? '/company' : '/', { replace: true })
      }, 1200)
    } catch { /* error from store */ }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[40px] leading-[48px] font-semibold">{L('Νέος κωδικός', 'New password')}</h1>
      <p className="text-ink-soft mt-2 mb-8 text-[15px]">
        {L('Ορίστε έναν νέο κωδικό για τον λογαριασμό σας.', 'Set a new password for your account.')}
      </p>

      {linked === false && (
        <div className="rounded-md border border-warn/40 bg-[#FBF1DA] px-4 py-3 text-[13px] text-[#A37620] mb-5">
          {L('Ο σύνδεσμος επαναφοράς δεν είναι ενεργός. Ζητήστε νέο από τη σελίδα "Ξεχάσατε τον κωδικό".',
             'The recovery link is no longer active. Request a new one from the "Forgot password" page.')}
        </div>
      )}

      {done ? (
        <div className="rounded-md border border-success/40 bg-success/5 px-4 py-4 text-[14px]">
          <div className="font-semibold text-success mb-1">{L('Έτοιμο!', 'All set.')}</div>
          <div className="text-[12.5px] text-ink-soft">{L('Είστε συνδεδεμένος. Σας μεταφέρουμε στην εφαρμογή…', 'You are signed in. Redirecting you to the app…')}</div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink mb-1.5">{L('Νέος κωδικός', 'New password')}</span>
            <input type="password" required autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)}
              className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
          </label>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink mb-1.5">{L('Επιβεβαίωση', 'Confirm')}</span>
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
          </label>
          {(localErr || error) && <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{localErr || error}</div>}
          <button type="submit" disabled={loading || linked === false}
            className="w-full h-11 bg-brand text-white rounded font-semibold text-[14.5px] hover:bg-brand-hover transition disabled:opacity-50">
            {loading ? L('Αποθήκευση…', 'Saving…') : L('Αποθήκευση νέου κωδικού', 'Save new password')}
          </button>
        </form>
      )}

      <p className="mt-6 text-[13px] text-ink-soft">
        <Link to="/login" className="text-brand hover:underline">← {L('Επιστροφή στη σύνδεση', 'Back to sign in')}</Link>
      </p>
    </AuthShell>
  )
}
