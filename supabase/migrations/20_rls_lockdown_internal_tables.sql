-- 20 — Lock down internal tables + tighten SECURITY DEFINER function access.
--
-- Why:
--   Supabase's security advisor (2026-05-31 alert) flagged 3 public tables
--   with RLS disabled:
--     - public.groups            (added in migration 17)
--     - public.activity_events   (added in migration 18)
--     - public.webhook_events    (added in migration 18)
--
--   With RLS off, anyone with the anon key (which is in the browser bundle)
--   could hit PostgREST directly at /rest/v1/<table> and read/write/delete
--   those tables. CF's architecture is "all writes through Netlify Functions
--   using the service-role key" — these tables are *never* accessed from
--   the browser via supabase-js (verified: zero direct .from() calls in
--   src/). So enabling RLS with NO policies attached fully locks them from
--   the anon/authenticated roles; service-role bypasses RLS so the
--   functions continue working unchanged.
--
--   Also revoking EXECUTE on the SECURITY DEFINER helper functions from
--   PUBLIC (which transitively grants to anon/authenticated). REVOKE FROM
--   anon, authenticated alone is NOT enough — Postgres default-grants on
--   PUBLIC and the children inherit. Service-role is re-granted explicitly
--   so cf-* functions can still call them.
--
--   handle_new_user is a trigger function — never needs RPC access from
--   anyone. Left unprivileged for non-trigger contexts.
--
-- Rollback (if a future change needs anon/authenticated to query these):
--   alter table public.<name> disable row level security;
--   -- or add specific policies for the role + operation needed.

-- ---- RLS ON, no policies = anon/authenticated get zero access ----
alter table public.groups          enable row level security;
alter table public.activity_events enable row level security;
alter table public.webhook_events  enable row level security;

-- ---- Revoke EXECUTE on SECURITY DEFINER helpers from PUBLIC ----
-- (REVOKE FROM PUBLIC catches anon, authenticated, and any future role
-- that inherits from PUBLIC. REVOKE FROM anon, authenticated would NOT
-- remove the underlying PUBLIC grant — needs both, but PUBLIC suffices.)
revoke execute on function public.handle_new_user()     from public;
revoke execute on function public.current_company_id()  from public;
revoke execute on function public.current_employee_id() from public;
revoke execute on function public.is_cf_admin()         from public;

-- Re-grant to service_role explicitly — cf-* functions need to call these.
grant execute on function public.current_company_id()  to service_role;
grant execute on function public.current_employee_id() to service_role;
grant execute on function public.is_cf_admin()         to service_role;
-- handle_new_user stays unprivileged — it's a trigger, fires under the
-- table-owner's context, not as RPC.
