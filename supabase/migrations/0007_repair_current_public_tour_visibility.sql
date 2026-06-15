-- Repair/verify current public tour visibility in environments that missed 0006.
-- Safe to run repeatedly; refreshes PostgREST so Supabase schema cache sees tours.is_current_public.

alter table tours
  add column if not exists is_current_public boolean not null default false;

create unique index if not exists tours_single_current_public_idx
  on tours (is_current_public)
  where is_current_public = true;

with candidate as (
  select id
  from tours
  where status in ('active', 'planned', 'complete')
  order by case status when 'active' then 0 when 'planned' then 1 when 'complete' then 2 else 3 end,
    year desc,
    start_date desc nulls last,
    created_at desc
  limit 1
)
update tours
set is_current_public = true
where id in (select id from candidate)
  and not exists (select 1 from tours where is_current_public = true);

notify pgrst, 'reload schema';
