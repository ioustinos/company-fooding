-- Migration 09 — pin search_path on tg_set_updated_at (advisor lint 0011)
--
-- The function had a mutable search_path which the Supabase security advisor
-- flags. Pinning it to public is enough — the function only touches new.
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
