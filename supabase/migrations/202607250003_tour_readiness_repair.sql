-- Repair fresh-schema course visibility, preserve known 2026 dates, and make
-- fully exercised QA tours explicitly disposable without weakening real-tour
-- history protection.
-- Safe to run repeatedly.

alter table public.tours
  add column if not exists is_test boolean not null default false;

update public.tours
set is_test = true,
    updated_at = now()
where upper(btrim(name)) like 'QA TEST TOUR%'
  and is_test = false;

update public.tours
set start_date = coalesce(start_date, date '2026-11-06'),
    end_date = coalesce(end_date, date '2026-11-09'),
    timezone = 'Europe/Lisbon',
    updated_at = now()
where year = 2026
  and upper(btrim(name)) = 'ROEGUSTA TOUR 2026';

notify pgrst, 'reload schema';
