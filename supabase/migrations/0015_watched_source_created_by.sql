-- Lets deleteWatchedSource restrict admins to removing only sources they
-- added themselves — previously any admin could delete any watched source
-- regardless of who set it up. super_admin keeps an override (moderation
-- of a source added by since-removed staff, etc.), the same pattern
-- already used for team management.
alter table watched_sources add column created_by uuid references profiles (id);

drop policy "admins can delete watched sources" on watched_sources;
create policy "admins can delete their own watched sources"
  on watched_sources for delete
  using (is_admin() and (created_by = auth.uid() or is_super_admin()));
