insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do update set public = excluded.public;

alter table public.players add column if not exists photo_path text;
alter table public.tour_players add column if not exists nickname text;
alter table public.tour_players add column if not exists photo_url text;
alter table public.tour_players add column if not exists photo_path text;
alter table public.tour_players add column if not exists profile_bio text;

notify pgrst, 'reload schema';
