-- 17_groups.sql — employee groups (Engineering, Sales, etc.) for cleaner
-- benefit assignment + CSV import.
--
-- One row per (company × group). "code" is short uppercase (ENG, SALES, ALL)
-- used in CSV import and shown as a chip. is_system rows (currently just "ALL")
-- are protected from rename/delete in the UI.
--
-- Applied to Supabase on 2026-05-26 via MCP apply_migration.

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  code        text not null,
  name_el     text not null,
  name_en     text not null,
  status      text not null default 'active' check (status in ('active','archived')),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);
create index if not exists idx_groups_company on public.groups(company_id);

-- employees.group_id already exists; wire the FK now that the target table exists.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_group_id_fkey') then
    alter table public.employees
      add constraint employees_group_id_fkey
      foreign key (group_id) references public.groups(id) on delete set null;
  end if;
end$$;

-- updated_at trigger (reuses standard touch_updated_at function)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'groups_touch_updated_at') then
      create trigger groups_touch_updated_at
        before update on public.groups
        for each row execute function public.touch_updated_at();
    end if;
  end if;
end$$;

-- Seed an "ALL" system group per existing company. Idempotent.
insert into public.groups (company_id, code, name_el, name_en, is_system)
select c.id, 'ALL', 'Όλοι', 'Everyone', true
from public.companies c
where not exists (select 1 from public.groups g where g.company_id = c.id and g.code = 'ALL');
