-- Auth wiring: auto-create a profile row on signup (admin's email gets the
-- admin role automatically, everyone else defaults to organiser per spec
-- section 6 — organiser accounts are admin-invited, not self-registered, so
-- in practice the only way to reach this trigger as an organiser is via an
-- admin-issued invite), plus the write-side RLS policies that were deferred
-- from 0001_init.sql until auth existed to check roles against.

create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.email = 'stevejwikeley@gmail.com' then 'admin' else 'organiser' end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- helper: is the current user an admin?
create function is_admin() returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

-- ---------- events ----------
-- Admins can do anything. Organisers get direct-publish rights (spec
-- section 6) scoped to events they created — not by club membership.

create policy "admins can read all events"
  on events for select
  using (is_admin());

create policy "organisers can read their own events"
  on events for select
  using (auth.uid() = created_by);

create policy "admins can insert events"
  on events for insert
  with check (is_admin());

create policy "organisers can insert their own events"
  on events for insert
  with check (auth.uid() = created_by and not is_admin());

create policy "admins can update any event"
  on events for update
  using (is_admin());

create policy "organisers can update their own events"
  on events for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "admins can delete any event"
  on events for delete
  using (is_admin());

create policy "organisers can delete their own events"
  on events for delete
  using (auth.uid() = created_by);

-- ---------- events_pending ----------
-- Anyone (including anonymous "suggest a change" submissions) can insert.
-- Only admins can read/action the queue.

create policy "anyone can submit a pending change"
  on events_pending for insert
  with check (true);

create policy "admins can read pending queue"
  on events_pending for select
  using (is_admin());

create policy "admins can update pending queue"
  on events_pending for update
  using (is_admin());

create policy "admins can delete from pending queue"
  on events_pending for delete
  using (is_admin());

-- ---------- watched_sources ----------
-- Admin-only, per spec section 6.

create policy "admins can read watched sources"
  on watched_sources for select
  using (is_admin());

create policy "admins can insert watched sources"
  on watched_sources for insert
  with check (is_admin());

create policy "admins can update watched sources"
  on watched_sources for update
  using (is_admin());

create policy "admins can delete watched sources"
  on watched_sources for delete
  using (is_admin());

-- ---------- profiles ----------

create policy "admins can read all profiles"
  on profiles for select
  using (is_admin());
