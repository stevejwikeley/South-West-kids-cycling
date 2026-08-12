-- Dismissable site feedback popup: a short, anonymous survey. No auth
-- required to submit, same public-insert pattern as events_pending.

create table site_feedback (
  id uuid primary key default gen_random_uuid(),
  raced_before boolean,
  usefulness smallint check (usefulness between 1 and 5),
  will_subscribe text check (will_subscribe in ('yes', 'no', 'already')),
  message text,
  page_url text,
  created_at timestamptz not null default now()
);

alter table site_feedback enable row level security;

create policy "anyone can submit feedback"
  on site_feedback for insert
  with check (true);

create policy "admins can read feedback"
  on site_feedback for select
  using (is_admin());
