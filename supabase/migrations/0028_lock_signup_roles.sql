-- Security fix: stop self-signups from choosing their own staff role.
--
-- 0014 and 0018 read the intended role from raw_user_meta_data, on the
-- assumption that only the server-side invite action could set it. That
-- isn't true: raw_user_meta_data is the `data` option of signUp() and
-- signInWithOtp(), which any visitor can call with the public anon key
-- (/my-events/login does exactly that to pass role: 'attendee'). So anyone
-- could sign up with data: { role: 'admin' } and land as an admin, and any
-- signup with no role at all (e.g. a new email typed into /login) fell
-- through to the 'organiser' default with dashboard access. Sign-ups can't
-- simply be switched off in Supabase Auth, because parents create attendee
-- accounts through /my-events/login.
--
-- The trustworthy signal is auth.users.invited_at: only
-- admin.auth.admin.inviteUserByEmail() (service role, behind the
-- admin-gated inviteTeamMember action) sets it. In production it lands a few
-- milliseconds after the row is inserted, via a separate update, so the
-- insert trigger alone can't see it. Hence:
--
--   * handle_new_user() (after insert) never grants a staff role unless
--     invited_at is already set. Self-signups become attendees, whatever
--     role they claim; a claimed staff role gets nothing at all.
--   * handle_user_invited() (after update, when invited_at goes from null to
--     set) grants the invited admin/organiser role.
--
-- The hardcoded site-owner email keeps its super_admin branch unchanged.
-- Existing users are untouched: both triggers only act on new rows or new
-- invites, and every insert is `on conflict do nothing`.

create or replace function handle_new_user() returns trigger as $$
declare
  claimed_role text := new.raw_user_meta_data->>'role';
begin
  if new.email = 'stevejwikeley@gmail.com' then
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'super_admin')
    on conflict (id) do nothing;
    return new;
  end if;

  if claimed_role in ('admin', 'organiser') then
    -- Only an invite may grant this. If invited_at is already set on insert,
    -- grant now; otherwise handle_user_invited() grants it when the invite
    -- update lands, and a self-signup claiming the role gets nothing.
    if new.invited_at is not null then
      insert into public.profiles (id, email, role)
      values (new.id, new.email, claimed_role::user_role)
      on conflict (id) do nothing;
    end if;
    return new;
  end if;

  insert into public.attendees (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function handle_user_invited() returns trigger as $$
declare
  invited_role text := new.raw_user_meta_data->>'role';
begin
  if invited_role in ('admin', 'organiser') then
    insert into public.profiles (id, email, role)
    values (new.id, new.email, invited_role::user_role)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
  after update of invited_at on auth.users
  for each row
  when (old.invited_at is null and new.invited_at is not null)
  execute function handle_user_invited();
