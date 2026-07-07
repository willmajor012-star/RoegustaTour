alter table public.rounds
  add column if not exists format text null;

alter table public.rounds
  drop constraint if exists rounds_format_check;

alter table public.rounds
  add constraint rounds_format_check
  check (format is null or format in ('singles', 'better_ball', 'foursomes', 'scramble', 'custom'));

update public.rounds
set format = case
  when lower(coalesce(format_label, '')) like '%scramble%' then 'scramble'
  when lower(coalesce(format_label, '')) like '%single%' then 'singles'
  when lower(coalesce(format_label, '')) like '%foursome%' then 'foursomes'
  when lower(coalesce(format_label, '')) like '%4bbb%' or lower(coalesce(format_label, '')) like '%better%' then 'better_ball'
  else format
end
where format is null;

notify pgrst, 'reload schema';
