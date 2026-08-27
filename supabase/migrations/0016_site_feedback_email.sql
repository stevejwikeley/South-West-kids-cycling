-- Optional email on site_feedback so we can follow up with someone who left
-- a comment, without making it required (the survey stays anonymous by
-- default, same as before).

alter table site_feedback add column email text;
