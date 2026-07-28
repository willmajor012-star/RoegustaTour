-- Populate the confirmed Roegusta Tour 2026 itinerary and daily shirts.
-- Safe to rerun: existing seeded rows and any later Admin edits are preserved.

alter table public.tour_itinerary_items
  add column if not exists end_time_label text;

do $$
declare
  selected_tour_id uuid;
  verbeek_team_id uuid;
  major_team_id uuid;
begin
  select id
    into selected_tour_id
  from public.tours
  where year = 2026
    and upper(btrim(name)) = 'ROEGUSTA TOUR 2026'
  limit 1;

  if selected_tour_id is null then
    raise notice 'Roegusta Tour 2026 was not found; no itinerary or shirt rows were added.';
    return;
  end if;

  select id
    into verbeek_team_id
  from public.tour_teams
  where tour_id = selected_tour_id
  order by
    case when upper(btrim(name)) = 'TEAM VERBEEK' then 0 else 1 end,
    sort_order,
    created_at,
    id
  limit 1;

  select id
    into major_team_id
  from public.tour_teams
  where tour_id = selected_tour_id
    and id is distinct from verbeek_team_id
  order by
    case when upper(btrim(name)) = 'TEAM MAJOR' then 0 else 1 end,
    sort_order,
    created_at,
    id
  limit 1;

  if verbeek_team_id is null then
    insert into public.tour_teams (id, tour_id, name, colour, sort_order, published)
    values (gen_random_uuid(), selected_tour_id, 'Team Verbeek', '#173B68', 0, true)
    returning id into verbeek_team_id;
  else
    update public.tour_teams
    set name = 'Team Verbeek',
        colour = '#173B68',
        sort_order = 0,
        published = true
    where id = verbeek_team_id;
  end if;

  if major_team_id is null then
    insert into public.tour_teams (id, tour_id, name, colour, sort_order, published)
    values (gen_random_uuid(), selected_tour_id, 'Team Major', '#8E2638', 1, true)
    returning id into major_team_id;
  else
    update public.tour_teams
    set name = 'Team Major',
        colour = '#8E2638',
        sort_order = 1,
        published = true
    where id = major_team_id;
  end if;

  -- Keep the original seed rows for audit/history, but stop the obsolete TBC
  -- cards from being inferred as live travel entries.
  update public.tour_itinerary_items
  set source_type = 'round',
      source_id = coalesce(source_id, 'retired-2026-placeholder-' || id::text),
      updated_at = now()
  where tour_id = selected_tour_id
    and is_placeholder = true
    and coalesce(time_label, '') = 'TBC'
    and coalesce(source_type, '') = ''
    and activity in (
      'Arrival / travel day',
      'Placeholder round / practice / opening matches',
      'Tour matches',
      'Final matches / departure'
    );

  insert into public.tour_itinerary_items (
    id,
    tour_id,
    item_date,
    time_label,
    end_time_label,
    activity,
    location,
    notes,
    is_placeholder,
    sort_order,
    source_type,
    source_id
  )
  select
    gen_random_uuid(),
    selected_tour_id,
    item_date,
    time_label,
    end_time_label,
    activity,
    location,
    notes,
    false,
    sort_order,
    source_type,
    source_id
  from (values
    (date '2026-11-06', '11:55', null,    'Arrive at Gatwick South Terminal',         'Gatwick Airport, South Terminal', null,                                                                      10, 'travel',  'rt2026-fri-gatwick-arrival'),
    (date '2026-11-06', '13:55', '16:45', 'BA flight to Faro',                        'Gatwick South → Faro',           null,                                                                      20, 'flight',  'rt2026-outbound-flight'),
    (date '2026-11-06', '17:00', null,    'Transfer to Amendoeira Golf Resort',        'Faro Airport → Amendoeira',      null,                                                                      30, 'travel',  'rt2026-fri-resort-transfer'),
    (date '2026-11-06', '17:45', null,    'Check-in & dinner at the Clubhouse',        'Amendoeira Clubhouse',           'Last orders are 21:30. We will likely pre-order and eat after the Par-3.', 40, 'food',    'rt2026-fri-clubhouse-dinner'),
    (date '2026-11-06', '21:30', null,    'Drinks & 4BBB pairs announcement',          'Amendoeira Clubhouse',           null,                                                                      60, 'activity','rt2026-fri-drinks-pairings'),
    (date '2026-11-07', '08:30', null,    'Breakfast at the Clubhouse',                'Amendoeira Clubhouse',           null,                                                                      10, 'food',    'rt2026-sat-breakfast'),
    (date '2026-11-07', '15:00', null,    'Lunch',                                     'Amendoeira Golf Resort',         null,                                                                      30, 'food',    'rt2026-sat-lunch'),
    (date '2026-11-07', '18:30', null,    'Taxis into Vilamoura',                      'Amendoeira → Vilamoura',         null,                                                                      40, 'travel',  'rt2026-sat-vilamoura-taxis'),
    (date '2026-11-07', '20:30', null,    'Dinner, initiations & singles announcement','Rare Steakhouse, Vilamoura',     null,                                                                      50, 'food',    'rt2026-sat-rare-dinner'),
    (date '2026-11-08', '08:45', null,    'Breakfast',                                 'Amendoeira Golf Resort',         null,                                                                      10, 'food',    'rt2026-sun-breakfast'),
    (date '2026-11-08', '09:45', null,    'Shuttles to the Old Course',                'Amendoeira → Old Course',        'Allow approximately 30 minutes.',                                          20, 'travel',  'rt2026-sun-old-course-shuttle'),
    (date '2026-11-08', '18:00', null,    'Dinner at the Old Course',                  'Old Course, Vilamoura',          null,                                                                      40, 'food',    'rt2026-sun-old-course-dinner'),
    (date '2026-11-08', '20:30', null,    'Shuttles back to Amendoeira',               'Old Course → Amendoeira',        null,                                                                      50, 'travel',  'rt2026-sun-return-shuttle'),
    (date '2026-11-09', '08:30', null,    'Breakfast & check-out',                     'Amendoeira Golf Resort',         null,                                                                      10, 'food',    'rt2026-mon-breakfast-checkout'),
    (date '2026-11-09', '13:00', null,    'Lunch / optional Par-3 or padel',           'Amendoeira Golf Resort',         null,                                                                      30, 'activity','rt2026-mon-lunch-activities'),
    (date '2026-11-09', '15:00', null,    'Transfer to Faro Airport',                  'Amendoeira → Faro Airport',      null,                                                                      40, 'travel',  'rt2026-mon-airport-transfer'),
    (date '2026-11-09', '17:50', '20:40', 'BA flight to London Gatwick South',         'Faro → Gatwick South',           null,                                                                      50, 'flight',  'rt2026-inbound-flight')
  ) as confirmed_itinerary(
    item_date,
    time_label,
    end_time_label,
    activity,
    location,
    notes,
    sort_order,
    source_type,
    source_id
  )
  where not exists (
    select 1
    from public.tour_itinerary_items existing
    where existing.tour_id = selected_tour_id
      and (
        existing.source_id = confirmed_itinerary.source_id
        or (
          existing.item_date = confirmed_itinerary.item_date
          and lower(btrim(existing.activity)) = lower(btrim(confirmed_itinerary.activity))
        )
      )
  );

  update public.tour_team_day_kit existing
  set colour_label = kit.colour_label,
      sort_order = kit.sort_order
  from (values
    (verbeek_team_id, date '2026-11-06', 'Sunday Special', 0),
    (major_team_id,   date '2026-11-06', 'Sunday Special', 1),
    (verbeek_team_id, date '2026-11-07', 'Navy',           0),
    (major_team_id,   date '2026-11-07', 'White',          1),
    (verbeek_team_id, date '2026-11-08', 'White',          0),
    (major_team_id,   date '2026-11-08', 'Red',            1),
    (verbeek_team_id, date '2026-11-09', 'Red',            0),
    (major_team_id,   date '2026-11-09', 'Navy',           1)
  ) as kit(team_id, kit_date, colour_label, sort_order)
  where existing.tour_id = selected_tour_id
    and existing.team_id = kit.team_id
    and existing.kit_date = kit.kit_date
    and upper(btrim(existing.colour_label)) in ('', 'TBC');

  insert into public.tour_team_day_kit (
    id,
    tour_id,
    team_id,
    kit_date,
    colour_label,
    sort_order
  )
  select
    gen_random_uuid(),
    selected_tour_id,
    kit.team_id,
    kit.kit_date,
    kit.colour_label,
    kit.sort_order
  from (values
    (verbeek_team_id, date '2026-11-06', 'Sunday Special', 0),
    (major_team_id,   date '2026-11-06', 'Sunday Special', 1),
    (verbeek_team_id, date '2026-11-07', 'Navy',           0),
    (major_team_id,   date '2026-11-07', 'White',          1),
    (verbeek_team_id, date '2026-11-08', 'White',          0),
    (major_team_id,   date '2026-11-08', 'Red',            1),
    (verbeek_team_id, date '2026-11-09', 'Red',            0),
    (major_team_id,   date '2026-11-09', 'Navy',           1)
  ) as kit(team_id, kit_date, colour_label, sort_order)
  where not exists (
    select 1
    from public.tour_team_day_kit existing
    where existing.tour_id = selected_tour_id
      and existing.team_id = kit.team_id
      and existing.kit_date = kit.kit_date
  );
end
$$;

notify pgrst, 'reload schema';
