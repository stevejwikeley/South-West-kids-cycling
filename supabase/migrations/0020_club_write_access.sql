-- clubs has had a public-read policy since 0001_init.sql but no write
-- policy at all, so nothing (not even an admin) could create or edit a
-- club through the app — the five seeded rows were the only ones that
-- could ever exist. Clubs aren't owned by one organiser the way events
-- are (no created_by scoping makes sense for shared reference data used
-- across every organiser's events), so this adds a new is_staff() helper
-- — true for any signed-in admin, organiser, or super_admin — rather than
-- reusing is_admin() or a created_by check.

create function is_staff() returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

create policy "staff can insert clubs"
  on clubs for insert
  with check (is_staff());

create policy "staff can update clubs"
  on clubs for update
  using (is_staff())
  with check (is_staff());

create policy "staff can delete clubs"
  on clubs for delete
  using (is_staff());
