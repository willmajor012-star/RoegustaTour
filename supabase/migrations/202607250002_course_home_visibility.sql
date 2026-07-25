-- One saved course-guide system with explicit Home visibility.
-- Safe to run repeatedly.

alter table public.tour_courses
  add column if not exists show_on_home boolean not null default true;

create index if not exists tour_courses_home_visibility_idx
  on public.tour_courses(tour_id, published, show_on_home, sort_order);

notify pgrst, 'reload schema';
