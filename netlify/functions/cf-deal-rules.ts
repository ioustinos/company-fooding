// cf-deal-rules — the dated money terms of a deal (company × vendor agreement).
//
// GET  /api/cf-deal-rules?agreementId=<uuid>
//      super_admin → any deal; company_admin → own company's deals, read-only.
//      → { agreement, rules, canEdit, today }
//
// POST /api/cf-deal-rules   (super_admin only for now — proposing/accepting
//      changes between company and vendor comes later)
//   { action: 'create',  agreementId, rule }            add a rule
//   { action: 'change',  id, from, rule }               end the rule the day before `from`,
//                                                        start the new version on `from`
//   { action: 'end',     id, end_date }                 set the last day the rule applies
//   { action: 'correct', id, rule }                     edit in place — only before it starts
//   { action: 'delete',  id }                           remove — only before it starts
//
// Rules that have started are never edited in place, so periods already billed
// keep the terms they were billed with. Every write goes to activity_events.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, notFound, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { logActivity, type ActivityKind } from './_shared/activity'
import { addDays, type DealRule } from './_shared/dealRulesCore'
import { DEAL_RULE_COLUMNS, normalizeRule } from './_shared/dealRules'
import { athensToday, findOverlap, normalizeRuleInput, type RuleInput } from './_shared/dealRulesValidate'

type Sb = ReturnType<typeof supabaseAdmin>

async function loadAgreement(sb: Sb, id: string) {
  const { data, error } = await sb.from('matchmaking_agreements')
    .select('id, company_id, start_date, end_date, status, vendors(name), companies(name)')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as unknown as { id: string; company_id: string; start_date: string; end_date: string | null; status: string
    vendors: { name: string } | null; companies: { name: string } | null } | null
}

async function loadDealRules(sb: Sb, agreementId: string): Promise<DealRule[]> {
  const { data, error } = await sb.from('deal_rules').select(DEAL_RULE_COLUMNS)
    .eq('agreement_id', agreementId).order('kind').order('valid_from')
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRule)
}

async function loadRule(sb: Sb, id: string): Promise<DealRule | null> {
  const { data, error } = await sb.from('deal_rules').select(DEAL_RULE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? normalizeRule(data as unknown as Record<string, unknown>) : null
}

function describe(r: Pick<DealRule, 'kind' | 'valid_from' | 'valid_to'>): string {
  return `${r.kind} ${r.valid_from}${r.valid_to ? '→' + r.valid_to : '→'}`
}

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) return forbidden('Admins only')
    const sb = supabaseAdmin()
    const today = athensToday()

    if (req.method === 'GET') {
      const agreementId = new URL(req.url).searchParams.get('agreementId')
      if (!agreementId) return badRequest('agreementId required')
      const agreement = await loadAgreement(sb, agreementId)
      if (!agreement) return notFound('Deal not found')
      if (caller.role === 'company_admin' && agreement.company_id !== caller.companyId) return forbidden('Not your deal')
      const rules = await loadDealRules(sb, agreementId)
      return ok({ agreement, rules, canEdit: caller.role === 'super_admin', today })
    }

    if (req.method !== 'POST') return methodNotAllowed(['GET', 'POST'])
    if (caller.role !== 'super_admin') return forbidden('Only super admins can change deal terms')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? '')

    const log = (kind: ActivityKind, companyId: string, ruleId: string, en: string, el: string, payload: Record<string, unknown>) =>
      logActivity(sb, caller, companyId, kind, { target_type: 'deal_rule', target_id: ruleId, summary_en: en, summary_el: el, payload })

    // ── create ──
    if (action === 'create') {
      const agreementId = String(body.agreementId ?? '')
      const agreement = await loadAgreement(sb, agreementId)
      if (!agreement) return notFound('Deal not found')
      const { rule, errors } = normalizeRuleInput((body.rule ?? {}) as Record<string, unknown>)
      if (!rule) return badRequest('Invalid rule', errors)
      const clash = findOverlap(rule, await loadDealRules(sb, agreementId))
      if (clash) return badRequest(`Overlaps an existing rule of the same type (${describe(clash)}). End or change that one first.`)
      const { data, error } = await sb.from('deal_rules')
        .insert({ ...rule, agreement_id: agreementId, created_by: caller.user.id }).select(DEAL_RULE_COLUMNS).single()
      if (error) return badRequest(`Could not save: ${error.message}`)
      const saved = normalizeRule(data as unknown as Record<string, unknown>)
      await log('deal_rule.created', agreement.company_id, saved.id, `Deal term added: ${describe(saved)}`, `Προστέθηκε όρος συμφωνίας: ${describe(saved)}`, { rule: saved })
      return ok({ rule: saved })
    }

    // All other actions target an existing rule.
    const id = String(body.id ?? '')
    const existing = id ? await loadRule(sb, id) : null
    if (!existing) return notFound('Rule not found')
    const agreement = await loadAgreement(sb, existing.agreement_id)
    if (!agreement) return notFound('Deal not found')
    const started = existing.valid_from <= today

    // ── change from a date: close the current version, start a new one ──
    if (action === 'change') {
      const from = String(body.from ?? '')
      const { rule, errors } = normalizeRuleInput({ ...((body.rule ?? {}) as Record<string, unknown>), kind: existing.kind, valid_from: from })
      if (!rule) return badRequest('Invalid rule', errors)
      if (from <= existing.valid_from) return badRequest('The new version must start after the current one started. To fix a rule that has not started yet, use correct.')
      if (existing.valid_to && from > existing.valid_to) return badRequest('This rule has already ended before that date — add a new rule instead.')
      const others = (await loadDealRules(sb, existing.agreement_id)).filter((x) => x.id !== existing.id)
      const clash = findOverlap(rule, others)
      if (clash) return badRequest(`The new version overlaps another rule of the same type (${describe(clash)}).`)
      const prevTo = existing.valid_to
      const { error: e1 } = await sb.from('deal_rules').update({ valid_to: addDays(from, -1) }).eq('id', existing.id)
      if (e1) return badRequest(`Could not close the current version: ${e1.message}`)
      const { data, error: e2 } = await sb.from('deal_rules')
        .insert({ ...rule, agreement_id: existing.agreement_id, created_by: caller.user.id }).select(DEAL_RULE_COLUMNS).single()
      if (e2) {
        await sb.from('deal_rules').update({ valid_to: prevTo }).eq('id', existing.id) // roll back
        return badRequest(`Could not save the new version: ${e2.message}`)
      }
      const saved = normalizeRule(data as unknown as Record<string, unknown>)
      await log('deal_rule.changed', agreement.company_id, saved.id,
        `Deal term changed from ${from}: ${describe(existing)} → ${describe(saved)}`,
        `Αλλαγή όρου συμφωνίας από ${from}: ${describe(existing)} → ${describe(saved)}`,
        { previous: existing, next: saved })
      return ok({ rule: saved, closed: { ...existing, valid_to: addDays(from, -1) } })
    }

    // ── end ──
    if (action === 'end') {
      const end = String(body.end_date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return badRequest('end_date must be YYYY-MM-DD')
      if (end < existing.valid_from) return badRequest('The end date is before the rule starts — delete it instead.')
      const { error } = await sb.from('deal_rules').update({ valid_to: end }).eq('id', existing.id)
      if (error) return badRequest(`Could not end the rule: ${error.message}`)
      await log('deal_rule.ended', agreement.company_id, existing.id, `Deal term ends ${end}: ${describe(existing)}`, `Λήξη όρου συμφωνίας ${end}: ${describe(existing)}`, { rule: existing, end_date: end })
      return ok({ rule: { ...existing, valid_to: end } })
    }

    // ── correct / delete: only before the rule starts ──
    if (action === 'correct' || action === 'delete') {
      if (started) return badRequest('This rule is already in effect. Use "change from a date" or "end" so past periods keep their terms.')
      if (action === 'delete') {
        const { error } = await sb.from('deal_rules').delete().eq('id', existing.id)
        if (error) return badRequest(`Could not delete: ${error.message}`)
        await log('deal_rule.deleted', agreement.company_id, existing.id, `Deal term removed before it started: ${describe(existing)}`, `Αφαιρέθηκε όρος πριν ξεκινήσει: ${describe(existing)}`, { rule: existing })
        return ok({ deleted: existing.id })
      }
      const { rule, errors } = normalizeRuleInput({ ...((body.rule ?? {}) as Record<string, unknown>), kind: existing.kind })
      if (!rule) return badRequest('Invalid rule', errors)
      if (rule.valid_from <= today) return badRequest('A corrected rule must still start in the future. To start it now, use change from a date or add a new rule.')
      const clash = findOverlap(rule, await loadDealRules(sb, existing.agreement_id), existing.id)
      if (clash) return badRequest(`Overlaps another rule of the same type (${describe(clash)}).`)
      const { data, error } = await sb.from('deal_rules').update(rule as RuleInput).eq('id', existing.id).select(DEAL_RULE_COLUMNS).single()
      if (error) return badRequest(`Could not save: ${error.message}`)
      const saved = normalizeRule(data as unknown as Record<string, unknown>)
      await log('deal_rule.corrected', agreement.company_id, saved.id, `Deal term corrected before it started: ${describe(saved)}`, `Διόρθωση όρου πριν ξεκινήσει: ${describe(saved)}`, { previous: existing, next: saved })
      return ok({ rule: saved })
    }

    return badRequest(`Unknown action "${action}"`)
  } catch (e) {
    return errorResponse(e)
  }
}
