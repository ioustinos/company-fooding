-- Migration 08 — triggers + handle_new_user (E2.8)
--
-- 1. Generic updated_at trigger function + triggers on every mutable table.
-- 2. handle_new_user() — runs on auth.users.INSERT to resolve invites:
--    - If there's a pending company_users row with matching email, bind
--      user_id and flip status='active'.
--    - If there's an employees row with matching email, bind user_id.

-- ---------------------------- updated_at --------------------------------

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Apply to all mutable tables created so far.
do $$
declare
  t text;
  tables text[] := array[
    'cf_admins',
    'companies',
    'company_offices',
    'company_users',
    'employees',
    'vendors',
    'matchmaking_agreements',
    'agreement_offices',
    'agreement_shops',
    'benefits',
    'benefit_rules',
    'benefit_assignments',
    'benefit_ledger',
    'benefit_topups',
    'orders',
    'order_items',
    'order_benefit_uses',
    'invoices',
    'invoice_line_items',
    'settings'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;', t
    );
    -- order_benefit_uses has no updated_at column by design (append-only);
    -- skip it.
    if t <> 'order_benefit_uses' then
      execute format(
        'create trigger set_updated_at before update on public.%I
         for each row execute function public.tg_set_updated_at();', t
      );
    end if;
  end loop;
end $$;

-- ---------------------- handle_new_user (invite resolve) ----------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _email text := lower(coalesce(new.email, ''));
begin
  if _email = '' then
    return new;
  end if;

  -- Resolve pending company_users invite (email match, no user_id yet).
  update public.company_users
     set user_id = new.id,
         status  = 'active',
         updated_at = now()
   where lower(coalesce(email, '')) = _email
     and user_id is null;

  -- Resolve pending employee roster row (email match, no user_id yet).
  update public.employees
     set user_id = new.id,
         updated_at = now()
   where lower(email) = _email
     and user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
