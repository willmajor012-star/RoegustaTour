-- Confirm live publication columns and reload PostgREST schema cache.
-- Safe to run repeatedly in production environments that missed earlier migrations.

alter table tours
  add column if not exists is_current_public boolean not null default false;

alter table tour_teams
  add column if not exists published boolean not null default false;

alter table rounds
  add column if not exists published boolean not null default false;

alter table matches
  add column if not exists published boolean not null default false;

create unique index if not exists tours_single_current_public_idx
  on tours (is_current_public)
  where is_current_public = true;

create index if not exists tour_teams_public_idx on tour_teams(tour_id, published);
create index if not exists rounds_public_idx on rounds(tour_id, published, status);
create index if not exists matches_public_idx on matches(tour_id, published, status);

-- Keep completed historical rows visible even when the live-public workflow was added after import.
update tour_teams tt
set published = true
from tours t
where tt.tour_id = t.id
  and tt.published = false
  and t.status in ('complete', 'archived');

update rounds r
set published = true
from tours t
where r.tour_id = t.id
  and r.published = false
  and (r.status = 'complete' or t.status in ('complete', 'archived'));

update matches m
set published = true
from tours t
where m.tour_id = t.id
  and m.published = false
  and (m.status = 'complete' or t.status in ('complete', 'archived'));

notify pgrst, 'reload schema';
