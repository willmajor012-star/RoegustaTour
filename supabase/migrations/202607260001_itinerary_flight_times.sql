-- Add a distinct landing/arrival time to itinerary entries.
-- Ordering is controlled automatically by item date and departure time in the app.

alter table public.tour_itinerary_items
  add column if not exists end_time_label text;

update public.tour_itinerary_items
set source_type = 'flight',
    updated_at = now()
where source_type = 'travel'
  and activity ~* '\mflight\M';

notify pgrst, 'reload schema';
