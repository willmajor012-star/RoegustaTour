alter table tour_itinerary_items
  add column if not exists source_type text,
  add column if not exists source_id text;

create index if not exists tour_itinerary_items_source_idx
  on tour_itinerary_items(tour_id, source_type, source_id)
  where source_type is not null and source_id is not null;

notify pgrst, 'reload schema';
