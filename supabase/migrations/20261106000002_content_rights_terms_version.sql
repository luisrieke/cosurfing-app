-- Evidence for the usage rights contributors grant in the Terms of Use: when they accepted
-- and which version of the Terms was shown. Photos already store rights_accepted_at.
alter table public.reviews
  add column if not exists rights_accepted_at timestamptz,
  add column if not exists terms_version text
    check (terms_version is null or char_length(terms_version) <= 20);

alter table public.place_photos
  add column if not exists terms_version text
    check (terms_version is null or char_length(terms_version) <= 20);
