-- Public visibility controls for live-tour-safe publication.
-- Safe/idempotent: adds only nullable-safe defaulted flags and backfills public-safe historic data.

alter table tours
  add column if not exists is_current_public boolean not null default false;

alter table rounds
  add column if not exists published boolean not null default false;

alter table tour_teams
  add column if not exists published boolean not null default false;

-- Enforce a single explicit public current tour while allowing zero current tours for friendly empty states.
create unique index if not exists tours_single_current_public_idx
  on tours (is_current_public)
  where is_current_public = true;

create index if not exists rounds_public_idx on rounds(tour_id, published, status);
create index if not exists tour_teams_public_idx on tour_teams(tour_id, published);

-- Preserve archive displays and historic completed data without publishing future planning rows.
update rounds r
set published = true
from tours t
where r.tour_id = t.id
  and r.published = false
  and r.status = 'complete'
  and t.status in ('complete', 'archived');

update tour_teams tt
set published = true
from tours t
where tt.tour_id = t.id
  and tt.published = false
  and t.status in ('complete', 'archived');

-- If no explicit current public tour exists, choose the latest active/complete tour only.
-- Planned future tours are deliberately excluded so they cannot become public by newest year.
with candidate as (
  select id
  from tours
  where status in ('active', 'complete')
  order by case status when 'active' then 0 when 'complete' then 1 else 2 end, year desc, start_date desc nulls last, created_at desc
  limit 1
)
update tours
set is_current_public = true
where id in (select id from candidate)
  and not exists (select 1 from tours where is_current_public = true);

notify pgrst, 'reload schema';
