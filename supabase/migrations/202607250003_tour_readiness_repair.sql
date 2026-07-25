-- Repair fresh-schema course visibility, preserve known 2026 dates, install
-- the current tour's three saved guide snapshots, and make fully exercised QA
-- tours explicitly disposable without weakening real-tour history protection.
-- Safe to run repeatedly. Existing saved guides and edits are never overwritten.

create extension if not exists pgcrypto;

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

with target_tours as (
  select id
  from public.tours
  where year = 2026
    and is_test = false
    and (
      is_current_public = true
      or upper(btrim(name)) = 'ROEGUSTA TOUR 2026'
    )
),
guide_templates as (
  select
    guide ->> 'slug' as slug,
    guide ->> 'name' as name,
    guide ->> 'shortName' as short_name,
    guide ->> 'resort' as resort,
    guide ->> 'location' as location,
    guide ->> 'architect' as architect,
    guide ->> 'opened' as opened,
    guide ->> 'overview' as overview,
    guide ->> 'noteAvailability' as note_availability,
    guide ->> 'officialPageUrl' as official_page_url,
    guide ->> 'scorecardUrl' as scorecard_url,
    guide ->> 'heroImageUrl' as hero_image_url,
    guide ->> 'heroPosition' as hero_position,
    guide -> 'tees' as tees,
    guide -> 'holes' as holes,
    (ordinality - 1)::integer as sort_order
  from jsonb_array_elements(
    $course_guides$[{"slug":"faldo","name":"Faldo Course","shortName":"Faldo","resort":"Amendoeira Golf Resort","location":"Alcantarilha, Algarve","architect":"Sir Nick Faldo","opened":"2008","overview":"A strategic, elevated par-72 layout where careful positioning is central to scoring. The course moves through rolling Algarve terrain with exposed views and a deliberately demanding championship profile.","noteAvailability":"course-only","officialPageUrl":"https://www.amendoeiraresort.com/en/golf/","scorecardUrl":"https://amendoeira.backhotelite.com/uploads/files/cms_apps/pdf/faldo/Faldo_Course_Scorecard.pdf","heroImageUrl":"https://www.amendoeiraresort.com/media/uploads/page_setup_images/AGR_Faldo_13Tee_2_amendoeira.jpg?q=pr:sharp/rs:fill/w:1920/h:1080/g:ce/f:jpg","heroPosition":"center","tees":[{"key":"gold","label":"Gold","colour":"#c8a64d","textColour":"#102f24"},{"key":"white","label":"White","colour":"#f7f3e9","textColour":"#102f24"},{"key":"yellow","label":"Yellow","colour":"#f0cb3c","textColour":"#102f24"},{"key":"blue","label":"Blue","colour":"#447ab8"},{"key":"red","label":"Red","colour":"#ae3c45"}],"holes":[{"number":1,"par":4,"strokeIndex":7,"yards":{"gold":454,"white":448,"yellow":424,"blue":396,"red":350}},{"number":2,"par":3,"strokeIndex":17,"yards":{"gold":190,"white":185,"yellow":161,"blue":138,"red":105}},{"number":3,"par":4,"strokeIndex":11,"yards":{"gold":354,"white":349,"yellow":339,"blue":293,"red":234}},{"number":4,"par":5,"strokeIndex":3,"yards":{"gold":597,"white":569,"yellow":523,"blue":474,"red":424}},{"number":5,"par":4,"strokeIndex":9,"yards":{"gold":399,"white":367,"yellow":338,"blue":307,"red":258}},{"number":6,"par":5,"strokeIndex":5,"yards":{"gold":592,"white":565,"yellow":535,"blue":504,"red":453}},{"number":7,"par":3,"strokeIndex":13,"yards":{"gold":218,"white":212,"yellow":198,"blue":168,"red":137}},{"number":8,"par":4,"strokeIndex":1,"yards":{"gold":424,"white":397,"yellow":366,"blue":347,"red":302}},{"number":9,"par":4,"strokeIndex":15,"yards":{"gold":388,"white":383,"yellow":355,"blue":289,"red":238}},{"number":10,"par":4,"strokeIndex":8,"yards":{"gold":501,"white":487,"yellow":474,"blue":457,"red":408}},{"number":11,"par":3,"strokeIndex":16,"yards":{"gold":163,"white":144,"yellow":126,"blue":115,"red":105}},{"number":12,"par":4,"strokeIndex":6,"yards":{"gold":349,"white":343,"yellow":327,"blue":313,"red":277}},{"number":13,"par":5,"strokeIndex":2,"yards":{"gold":670,"white":646,"yellow":570,"blue":530,"red":491}},{"number":14,"par":4,"strokeIndex":10,"yards":{"gold":381,"white":375,"yellow":358,"blue":307,"red":283}},{"number":15,"par":4,"strokeIndex":14,"yards":{"gold":401,"white":363,"yellow":331,"blue":292,"red":267}},{"number":16,"par":3,"strokeIndex":18,"yards":{"gold":151,"white":136,"yellow":122,"blue":116,"red":91}},{"number":17,"par":4,"strokeIndex":4,"yards":{"gold":441,"white":407,"yellow":386,"blue":344,"red":313}},{"number":18,"par":5,"strokeIndex":12,"yards":{"gold":542,"white":509,"yellow":474,"blue":443,"red":408}}]},{"slug":"oconnor","name":"O'Connor Jnr. Course","shortName":"O'Connor","resort":"Amendoeira Golf Resort","location":"Alcantarilha, Algarve","architect":"Christy O'Connor Jnr.","opened":"2008","overview":"A par-72 valley course shaped around lakes and water hazards. It provides a greener, lower-lying contrast to the Faldo Course and rewards accurate placement throughout the round.","noteAvailability":"course-only","officialPageUrl":"https://www.amendoeiraresort.com/en/golf/","scorecardUrl":"https://amendoeira.backhotelite.com/uploads/files/cms_apps/pdf/oconnor/Oconnor_Jnr._Scorecard.pdf","heroImageUrl":"https://www.amendoeiraresort.com/media/uploads/page_setup_images/AGR_Oconner_Tee_18_Amendoeira.jpg?q=pr:sharp/rs:fill/w:1920/h:1080/g:ce/f:jpg","heroPosition":"center","tees":[{"key":"gold","label":"Gold","colour":"#c8a64d","textColour":"#102f24"},{"key":"white","label":"White","colour":"#f7f3e9","textColour":"#102f24"},{"key":"yellow","label":"Yellow","colour":"#f0cb3c","textColour":"#102f24"},{"key":"blue","label":"Blue","colour":"#447ab8"},{"key":"red","label":"Red","colour":"#ae3c45"}],"holes":[{"number":1,"par":5,"strokeIndex":11,"yards":{"gold":597,"white":561,"yellow":544,"blue":521,"red":514}},{"number":2,"par":4,"strokeIndex":7,"yards":{"gold":399,"white":353,"yellow":329,"blue":292,"red":256}},{"number":3,"par":3,"strokeIndex":15,"yards":{"gold":177,"white":162,"yellow":152,"blue":136,"red":124}},{"number":4,"par":4,"strokeIndex":3,"yards":{"gold":448,"white":408,"yellow":392,"blue":373,"red":355}},{"number":5,"par":5,"strokeIndex":17,"yards":{"gold":533,"white":517,"yellow":499,"blue":490,"red":457}},{"number":6,"par":3,"strokeIndex":9,"yards":{"gold":213,"white":180,"yellow":165,"blue":155,"red":138}},{"number":7,"par":4,"strokeIndex":5,"yards":{"gold":412,"white":395,"yellow":378,"blue":348,"red":324}},{"number":8,"par":4,"strokeIndex":1,"yards":{"gold":440,"white":406,"yellow":361,"blue":318,"red":295}},{"number":9,"par":4,"strokeIndex":13,"yards":{"gold":457,"white":434,"yellow":417,"blue":408,"red":400}},{"number":10,"par":4,"strokeIndex":6,"yards":{"gold":442,"white":427,"yellow":411,"blue":397,"red":362}},{"number":11,"par":5,"strokeIndex":14,"yards":{"gold":559,"white":547,"yellow":516,"blue":482,"red":440}},{"number":12,"par":4,"strokeIndex":8,"yards":{"gold":430,"white":386,"yellow":366,"blue":349,"red":334}},{"number":13,"par":3,"strokeIndex":18,"yards":{"gold":170,"white":161,"yellow":144,"blue":142,"red":127}},{"number":14,"par":4,"strokeIndex":2,"yards":{"gold":470,"white":417,"yellow":376,"blue":367,"red":338}},{"number":15,"par":4,"strokeIndex":4,"yards":{"gold":442,"white":422,"yellow":394,"blue":385,"red":347}},{"number":16,"par":5,"strokeIndex":12,"yards":{"gold":550,"white":530,"yellow":517,"blue":503,"red":469}},{"number":17,"par":3,"strokeIndex":16,"yards":{"gold":188,"white":165,"yellow":164,"blue":152,"red":125}},{"number":18,"par":4,"strokeIndex":10,"yards":{"gold":409,"white":389,"yellow":370,"blue":350,"red":329}}]},{"slug":"old-course","name":"Old Course","shortName":"Old Course","resort":"Vilamoura Golf","location":"Vilamoura, Algarve","architect":"Frank Pennink","opened":"1969","overview":"A historic par-73 course routed through mature umbrella pines and rolling fairways. Its traditional shape, narrow corridors and natural contours make position and club selection more important than raw power.","noteAvailability":"hole-by-hole","officialPageUrl":"https://www.vilamouragolf.com/en/golf-courses/old-course/","scorecardUrl":"https://www.vilamouragolf.com/wp-content/uploads/2026/06/Old-Course_ScoreCards_148x105mm_digital.pdf","heroImageUrl":"https://www.vilamouragolf.com/wp-content/uploads/2026/03/oldcourse-photos.jpg","heroPosition":"center","tees":[{"key":"white","label":"White","colour":"#f7f3e9","textColour":"#102f24"},{"key":"yellow","label":"Yellow","colour":"#f0cb3c","textColour":"#102f24"},{"key":"blue","label":"Blue","colour":"#447ab8"},{"key":"red","label":"Red","colour":"#ae3c45"}],"holes":[{"number":1,"par":4,"strokeIndex":17,"officialNote":"A downhill opener: favour position before approaching between the front bunkers.","yards":{"white":339,"yellow":330,"blue":324,"red":308}},{"number":2,"par":5,"strokeIndex":5,"officialNote":"A rising par five; avoid the left bunker and hidden plateau.","yards":{"white":476,"yellow":456,"blue":445,"red":410}},{"number":3,"par":4,"strokeIndex":9,"officialNote":"Stay clear of the left umbrella pine to open the green.","yards":{"white":354,"yellow":328,"blue":317,"red":276}},{"number":4,"par":3,"strokeIndex":15,"officialNote":"Carry the pond and front bunker into the broad green.","yards":{"white":178,"yellow":163,"blue":152,"red":124}},{"number":5,"par":4,"strokeIndex":3,"officialNote":"Position carefully between sand and pines for a clean approach.","yards":{"white":452,"yellow":372,"blue":361,"red":331}},{"number":6,"par":3,"strokeIndex":11,"officialNote":"The longest par three plays downhill over the front bunkers.","yards":{"white":232,"yellow":214,"blue":198,"red":179}},{"number":7,"par":4,"strokeIndex":7,"officialNote":"Follow the uphill dogleg and allow extra club into the green.","yards":{"white":430,"yellow":376,"blue":365,"red":341}},{"number":8,"par":4,"strokeIndex":1,"officialNote":"The hardest hole bends uphill left toward a long hidden green.","yards":{"white":458,"yellow":437,"blue":427,"red":387}},{"number":9,"par":4,"strokeIndex":13,"officialNote":"A tactical short par four where tee position matters most.","yards":{"white":290,"yellow":273,"blue":273,"red":268}},{"number":10,"par":3,"strokeIndex":18,"officialNote":"Carry the depression and avoid leaving a short recovery.","yards":{"white":167,"yellow":162,"blue":151,"red":125}},{"number":11,"par":4,"strokeIndex":4,"officialNote":"Drive between bunkers before the rising approach through the pines.","yards":{"white":427,"yellow":406,"blue":390,"red":360}},{"number":12,"par":5,"strokeIndex":6,"officialNote":"Turn right, then climb through the narrow pine corridor.","yards":{"white":533,"yellow":527,"blue":516,"red":393}},{"number":13,"par":4,"strokeIndex":16,"officialNote":"Position before the ditch for the downhill approach.","yards":{"white":381,"yellow":374,"blue":363,"red":324}},{"number":14,"par":5,"strokeIndex":8,"officialNote":"A reachable par five: attack or lay up below the green.","yards":{"white":481,"yellow":466,"blue":443,"red":374}},{"number":15,"par":3,"strokeIndex":14,"officialNote":"Carry the hollow onto a wide but shallow bunkered green.","yards":{"white":164,"yellow":159,"blue":148,"red":116}},{"number":16,"par":5,"strokeIndex":2,"officialNote":"Favour the narrow fairway’s left before laying up.","yards":{"white":562,"yellow":540,"blue":529,"red":468}},{"number":17,"par":4,"strokeIndex":12,"officialNote":"Choose distance or position on this uphill dogleg left.","yards":{"white":386,"yellow":381,"blue":370,"red":341}},{"number":18,"par":5,"strokeIndex":10,"officialNote":"Drive right-centre through the pines before the closing approach.","yards":{"white":530,"yellow":491,"blue":481,"red":437}}]}]$course_guides$::jsonb
  ) with ordinality as template(guide, ordinality)
)
insert into public.tour_courses (
  tour_id,
  slug,
  name,
  short_name,
  resort,
  location,
  architect,
  opened,
  overview,
  note_availability,
  official_page_url,
  scorecard_url,
  hero_image_url,
  hero_position,
  tees,
  holes,
  sort_order,
  published,
  show_on_home
)
select
  target.id,
  guide.slug,
  guide.name,
  guide.short_name,
  guide.resort,
  guide.location,
  guide.architect,
  guide.opened,
  guide.overview,
  guide.note_availability,
  guide.official_page_url,
  guide.scorecard_url,
  guide.hero_image_url,
  guide.hero_position,
  guide.tees,
  guide.holes,
  guide.sort_order,
  true,
  true
from target_tours as target
cross join guide_templates as guide
on conflict (tour_id, slug) do nothing;

update public.rounds as round_row
set course_id = course.id,
    updated_at = now()
from public.tours as tour_row
join public.tour_courses as course
  on course.tour_id = tour_row.id
where round_row.tour_id = tour_row.id
  and tour_row.year = 2026
  and tour_row.is_test = false
  and round_row.course_id is null
  and (
    (round_row.round_number = 1 and course.slug = 'faldo')
    or (round_row.round_number = 3 and course.slug = 'old-course')
  );

notify pgrst, 'reload schema';
