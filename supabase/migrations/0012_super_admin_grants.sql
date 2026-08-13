-- is_admin() now covers both admin and super_admin, so every existing RLS
-- policy (all written against is_admin()) extends to super_admin
-- automatically with no other policy changes needed. is_super_admin() is a
-- separate, stricter check reserved for promoting/demoting other users'
-- roles — a regular admin keeps every other capability admin already had
-- (events, pending queue, ingestion, watched sources, inviting
-- organisers), just not the ability to create more admins.

create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$ language sql stable security definer set search_path = public;

create function is_super_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  );
$$ language sql stable security definer set search_path = public;

-- New signups via the hardcoded site-owner email become super_admin
-- instead of admin from now on; this only affects future signups, not the
-- existing row (updated explicitly below).
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.email = 'stevejwikeley@gmail.com' then 'super_admin' else 'organiser' end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

update profiles set role = 'super_admin' where email = 'stevejwikeley@gmail.com';
