import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, type AppRole } from '../../store/useAuthStore'

type Props = {
  allow: AppRole[]
  children: ReactNode
}

/**
 * RoleGuard — gates a route tree by app role.
 *
 * - Hydrates the auth store on mount if it hasn't been yet.
 * - While hydrating, renders null to avoid a flash of the login page.
 * - If no session, redirects to /login with `from` set so we can bounce back.
 * - If the user's role isn't in `allow`, redirects to / (employee home).
 */
export function RoleGuard({ allow, children }: Props) {
  const { session, user, loading, hydrate } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (!session && !loading) void hydrate()
  }, [session, loading, hydrate])

  if (loading) return null

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user?.role && !allow.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
