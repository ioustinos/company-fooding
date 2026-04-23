// Shared error envelope + helpers for Netlify Functions.
//
// Usage:
//   if (!user) return unauthorized('Sign in required')
//   try { ... } catch (e) { return errorResponse(e) }

export type ErrorBody = {
  error: string
  code?: string
  validationErrors?: Record<string, string[]>
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function ok<T>(body: T): Response {
  return jsonResponse(200, body)
}

export function badRequest(
  message: string,
  validationErrors?: ErrorBody['validationErrors'],
): Response {
  return jsonResponse(400, { error: message, validationErrors })
}

export function unauthorized(message = 'Unauthorized'): Response {
  return jsonResponse(401, { error: message })
}

export function forbidden(message = 'Forbidden'): Response {
  return jsonResponse(403, { error: message })
}

export function notFound(message = 'Not found'): Response {
  return jsonResponse(404, { error: message })
}

export function methodNotAllowed(allow: string[] = []): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'content-type': 'application/json',
      ...(allow.length ? { allow: allow.join(', ') } : {}),
    },
  })
}

export function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Internal error'
  console.error('[cf-fn error]', err)
  return jsonResponse(500, { error: message })
}
