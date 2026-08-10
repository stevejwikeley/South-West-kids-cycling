-- Fix: a CASE expression with two string-literal branches resolves to type
-- text in Postgres (not "unknown"), so it doesn't implicitly cast to the
-- user_role enum on insert — this was causing "Database error saving new
-- user" on every signup. Explicit cast fixes it.

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    (case when new.email = 'stevejwikeley@gmail.com' then 'admin' else 'organiser' end)::user_role
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
