alter table tour_itinerary_items
  add column if not exists source_type text,
  add column if not exists source_id text;

update tour_itinerary_items
set
  source_type = 'round',
  source_id = substring(notes from '\[round:([^\]]+)\]')
where (source_type is null or source_id is null)
  and notes ~* '\[round:[^\]]+\]';

create index if not exists tour_itinerary_items_source_idx
  on tour_itinerary_items(tour_id, source_type, source_id)
  where source_type is not null and source_id is not null;

notify pgrst, 'reload schema';
