import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useUIStore } from '../store/useUIStore'
import AuthShell from './auth/AuthShell'

export default function ForgotPasswordPage() {
  const { requestPasswordReset, loading, error } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    try { await requestPasswordReset(email); setSent(true) } catch { /* error from store */ }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[40px] leading-[48px] font-semibold">{L('Επαναφορά κωδικού', 'Reset your password')}</h1>
      <p className="text-ink-soft mt-2 mb-8 text-[15px]">
        {L('Εισάγετε το email σας — θα σας στείλουμε έναν σύνδεσμο για να ορίσετε νέο κωδικό.',
           "Enter your email — we'll send you a link to set a new password.")}
      </p>

      {sent ? (
        <div className="rounded-md border border-success/40 bg-success/5 px-4 py-4 text-[14px]">
          <div className="font-semibold text-success mb-1">{L('Ελέγξτε το email σας', 'Check your email')}</div>
          <div className="text-[12.5px] text-ink-soft">
            {L(`Αν υπάρχει λογαριασμός με ${email}, στείλαμε σύνδεσμο επαναφοράς. Ελέγξτε επίσης τον φάκελο spam.`,
               `If an account with ${email} exists, a reset link is on the way. Don't forget to check spam.`)}
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className="block">
            <span className="block text-[13px] font-medium text-ink mb-1.5">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 bg-surface border border-line rounded-xs text-[14px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 transition" />
          </label>
          {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-[13px] text-danger">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full h-11 bg-brand text-white rounded font-semibold text-[14.5px] hover:bg-brand-hover transition disabled:opacity-50">
            {loading ? L('Αποστολή…', 'Sending…') : L('Αποστολή συνδέσμου', 'Send reset link')}
          </button>
        </form>
      )}

      <p className="mt-6 text-[13px] text-ink-soft">
        <Link to="/login" className="text-brand hover:underline">← {L('Επιστροφή στη σύνδεση', 'Back to sign in')}</Link>
      </p>
    </AuthShell>
  )
}
