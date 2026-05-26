import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, type AppRole } from '../../store/useAuthStore'

type Props = {
  allow: AppRole[]
  children: ReactNode
}

/**
 * RoleGuard — gates a route tree by app role.
 *
 * Boot hydration is owned by App.tsx (renders a splash until hydrated), so
 * by the time we reach a guarded route, `session` is the final answer. No
 * loading races to worry about here.
 *
 * - If no session, redirects to /login with `from` so we can bounce back.
 * - If the user's role isn't in `allow`, redirects to / (employee home).
 */
export function RoleGuard({ allow, children }: Props) {
  const { session, user } = useAuthStore()
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user?.role && !allow.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
