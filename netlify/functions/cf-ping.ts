import type { Context } from '@netlify/functions'
import { ok, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'

// Sanity-check endpoint. Hit at `/.netlify/functions/cf-ping` or via the
// `/api/cf-ping` rewrite defined in netlify.toml.
export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])

  try {
    const caller = await getCaller(req)
    return ok({
      status: 'ok',
      now: new Date().toISOString(),
      authenticated: !!caller,
      role: caller?.role ?? null,
      companyId: caller?.companyId ?? null,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
