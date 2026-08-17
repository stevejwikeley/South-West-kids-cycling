-- Lets an invite bake the intended role (admin or organiser) into
-- raw_user_meta_data at invite time, via
-- admin.auth.admin.inviteUserByEmail(email, { data: { role } }). Safe to
-- trust: this metadata is set server-side by the super_admin-gated invite
-- action (app/admin/actions.ts), and the trigger below consumes it
-- synchronously the moment auth.users gets the row — before the invited
-- person has ever authenticated, so they can never influence their own
-- starting role via a later auth.updateUser() call. Previously the invited
-- role was always ignored and everyone but the hardcoded site-owner email
-- landed as 'organiser' regardless of what they were invited as.
create or replace function handle_new_user() returns trigger as $$
declare
  invited_role text := new.raw_user_meta_data->>'role';
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email = 'stevejwikeley@gmail.com' then 'super_admin'
      when invited_role in ('admin', 'organiser') then invited_role::user_role
      else 'organiser'
    end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
