// cf-groups — employee groups for a company.
//
// GET    /api/cf-groups?companyId=<uuid>            → list (with people counts)
// POST   /api/cf-groups   { companyId, code, name_el, name_en }   → create
// PATCH  /api/cf-groups   { id, code?, name_el?, name_en?, status? }
// DELETE /api/cf-groups   { id }                    → soft-archive (status=archived)
//
// Authz: super_admin → any company; company_admin → own. The is_system "ALL"
// group cannot be renamed, archived, or deleted (it auto-tracks all active
// employees in the company).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { logActivity } from './_shared/activity'

type Body = { companyId?: string; id?: string; code?: string; name_el?: string; name_en?: string; status?: 'active' | 'archived' }

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    const resolveCompany = (v: string | null) => (caller.role === 'company_admin' ? caller.companyId : v)

    // ---- GET ----
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const companyId = resolveCompany(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')
      const { data, error } = await sb.from('groups')
        .select('id, code, name_el, name_en, status, is_system, created_at')
        .eq('company_id', companyId).order('is_system', { ascending: false }).order('code')
      if (error) throw new Error(error.message)
      const groups = (data ?? []) as Array<{ id: string; code: string; is_system: boolean } & Record<string, unknown>>
      // counts: non-system → exact count; ALL system group → all active employees
      if (groups.length > 0) {
        const ids = groups.filter((g) => !g.is_system).map((g) => g.id)
        const counts = new Map<string, number>()
        if (ids.length > 0) {
          const { data: emps } = await sb.from('employees').select('group_id').in('group_id', ids).eq('status', 'active')
          for (const e of (emps ?? []) as Array<{ group_id: string }>) counts.set(e.group_id, (counts.get(e.group_id) ?? 0) + 1)
        }
        const { count: activeAll } = await sb.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active')
        for (const g of groups) g.people = g.is_system && g.code === 'ALL' ? (activeAll ?? 0) : (counts.get(g.id) ?? 0)
      }
      return ok({ groups })
    }

    const verifyOwn = async (groupId: string) => {
      const { data: g } = await sb.from('groups').select('company_id, is_system').eq('id', groupId).maybeSingle()
      if (!g) return badRequest('group not found')
      if (caller.role === 'company_admin' && g.company_id !== caller.companyId) return forbidden('Not your group')
      return g as { company_id: string; is_system: boolean }
    }

    // ---- POST (create) ----
    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as Body
      const companyId = resolveCompany(b.companyId ?? null)
      if (!companyId) return badRequest('companyId required')
      const code = (b.code ?? '').trim().toUpperCase()
      if (!code) return badRequest('code required')
      if (code === 'ALL') return badRequest('"ALL" is reserved')
      if (!b.name_el?.trim() || !b.name_en?.trim()) return badRequest('name_el and name_en required')
      const { data, error } = await sb.from('groups').insert({
        company_id: companyId, code, name_el: b.name_el.trim(), name_en: b.name_en.trim(),
      }).select('id, code, name_el, name_en, status, is_system').single()
      if (error) {
        if (error.code === '23505') return badRequest('A group with that code already exists')
        throw new Error(error.message)
      }
      void logActivity(sb, caller, companyId, 'group.created', {
        target_type: 'group', target_id: data.id,
        summary_el: `Δημιουργήθηκε ομάδα "${data.code}"`,
        summary_en: `Created group "${data.code}"`,
      })
      return ok({ group: data })
    }

    // ---- PATCH ----
    if (req.method === 'PATCH') {
      const b = (await req.json().catch(() => ({}))) as Body
      if (!b.id) return badRequest('id required')
      const v = await verifyOwn(b.id); if (v instanceof Response) return v
      if (v.is_system) return badRequest('System groups cannot be modified')
      const patch: Record<string, string> = {}
      if (b.code !== undefined) {
        const c = b.code.trim().toUpperCase()
        if (!c) return badRequest('code cannot be empty')
        if (c === 'ALL') return badRequest('"ALL" is reserved')
        patch.code = c
      }
      if (b.name_el !== undefined) { if (!b.name_el.trim()) return badRequest('name_el cannot be empty'); patch.name_el = b.name_el.trim() }
      if (b.name_en !== undefined) { if (!b.name_en.trim()) return badRequest('name_en cannot be empty'); patch.name_en = b.name_en.trim() }
      if (b.status !== undefined) { if (!['active', 'archived'].includes(b.status)) return badRequest('status must be active|archived'); patch.status = b.status }
      if (Object.keys(patch).length === 0) return badRequest('nothing to update')
      const { data, error } = await sb.from('groups').update(patch).eq('id', b.id).select('id, code, name_el, name_en, status, is_system').single()
      if (error) {
        if (error.code === '23505') return badRequest('A group with that code already exists')
        throw new Error(error.message)
      }
      void logActivity(sb, caller, v.company_id, 'group.updated', {
        target_type: 'group', target_id: b.id,
        summary_el: `Ενημερώθηκε ομάδα "${data.code}"`,
        summary_en: `Updated group "${data.code}"`,
      })
      return ok({ group: data })
    }

    // ---- DELETE (soft-archive) ----
    if (req.method === 'DELETE') {
      const b = (await req.json().catch(() => ({}))) as { id?: string }
      if (!b.id) return badRequest('id required')
      const v = await verifyOwn(b.id); if (v instanceof Response) return v
      if (v.is_system) return badRequest('System groups cannot be archived')
      const { error } = await sb.from('groups').update({ status: 'archived' }).eq('id', b.id)
      if (error) throw new Error(error.message)
      void logActivity(sb, caller, v.company_id, 'group.archived', {
        target_type: 'group', target_id: b.id,
        summary_el: 'Ομάδα αρχειοθετήθηκε',
        summary_en: 'Group archived',
      })
      return ok({ archived: 1 })
    }

    return methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE'])
  } catch (e) {
    return errorResponse(e)
  }
}
