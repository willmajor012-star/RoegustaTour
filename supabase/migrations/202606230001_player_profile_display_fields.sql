alter table public.players add column if not exists photo_url text;
alter table public.players add column if not exists profile_bio text;

notify pgrst, 'reload schema';
