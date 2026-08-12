-- Monthly email digest subscribers. Single opt-in (an email address alone
-- is enough to subscribe) with a per-subscriber unsubscribe_token used in
-- every digest's unsubscribe link — no login, no double opt-in confirmation
-- email, matching the low-stakes nature of "a monthly list of upcoming
-- races". All writes to this table go through the service-role client (the
-- subscribe/unsubscribe server actions and the digest cron), so the RLS
-- policies below exist for defense-in-depth and to match this project's
-- convention of every table having explicit policies, not because the app
-- relies on the anon-key insert path.

create table email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  unsubscribe_token uuid not null default gen_random_uuid(),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

alter table email_subscribers enable row level security;

create policy "anyone can subscribe"
  on email_subscribers for insert
  with check (true);

create policy "admins can read subscribers"
  on email_subscribers for select
  using (is_admin());
