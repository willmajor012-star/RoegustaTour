import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadItineraryModule() {
  const source = await readFile(new URL('../src/lib/tourItinerary.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: 'tourItinerary.ts',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const item = (id, tourId, activity, overrides = {}) => ({
  id,
  tourId,
  itemDate: '2026-11-07',
  activity,
  isPlaceholder: false,
  sortOrder: 10,
  ...overrides,
});

const round = (id, tourId, overrides = {}) => ({
  id,
  tourId,
  roundNumber: 1,
  name: 'Saturday golf',
  roundDate: '2026-11-07',
  courseName: 'Faldo Course',
  teeTime: '09:20',
  status: 'planned',
  published: true,
  ...overrides,
});

test('one tour itinerary admin workflow replaces the public handbook editor', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
  const component = await readFile(new URL('../src/components/AdminTourItinerary.tsx', import.meta.url), 'utf8');
  assert.match(admin, /'Tour itinerary'/);
  assert.match(admin, /<AdminTourItinerary/);
  assert.doesNotMatch(admin.match(/const tabs = \[[^\]]+\]/)?.[0] ?? '', /'Handbook'/);
  for (const copy of ['Travel, stay and dinner', 'Golf from rounds', 'Team shirts', 'Golf is pulled directly from Rounds &amp; tee times']) assert.match(component, new RegExp(copy));
});

test('only flights, travel, accommodation and dinner rows feed the manual itinerary', async () => {
  const { activeManualItineraryItems } = await loadItineraryModule();
  const rows = [
    item('flight', 'tour-1', 'Outbound flight', { sourceType: 'travel' }),
    item('hotel', 'tour-1', 'Hotel check-in'),
    item('dinner', 'tour-1', 'Dinner', { sourceType: 'dinner' }),
    item('old-golf', 'tour-1', 'Tour matches', { sourceType: 'template_2026' }),
    item('round-copy', 'tour-1', 'Saturday golf', { sourceType: 'round', sourceId: 'round-1' }),
    item('other-tour', 'tour-2', 'Dinner', { sourceType: 'dinner' }),
  ];
  assert.deepEqual(activeManualItineraryItems(rows, 'tour-1').map((row) => row.id).sort(), ['dinner', 'flight', 'hotel']);
});

test('legacy travel flights are recognised as flights and entries order by clock time', async () => {
  const { activeManualItineraryItems, manualItineraryKind } = await loadItineraryModule();
  const rows = [
    item('late', 'tour-1', 'Dinner', { sourceType: 'dinner', timeLabel: '20:00', sortOrder: 1 }),
    item('flight', 'tour-1', 'Outbound flight', { sourceType: 'travel', timeLabel: '08:30', endTimeLabel: '11:10', sortOrder: 99 }),
    item('transfer', 'tour-1', 'Airport transfer', { sourceType: 'travel', timeLabel: '12:00', sortOrder: 1 }),
  ];
  assert.equal(manualItineraryKind(rows[1]), 'flight');
  assert.deepEqual(activeManualItineraryItems(rows, 'tour-1').map((row) => row.id), ['flight', 'transfer', 'late']);
});

test('golf schedule entries come directly from the selected tour rounds', async () => {
  const { buildTourSchedule } = await loadItineraryModule();
  const schedule = buildTourSchedule(
    'tour-1',
    [round('round-1', 'tour-1'), round('round-2', 'tour-2', { courseName: 'Other course' })],
    [item('dinner', 'tour-1', 'Dinner', { sourceType: 'dinner', timeLabel: '19:30' })],
  );
  assert.equal(schedule.filter((entry) => entry.kind === 'golf').length, 1);
  assert.equal(schedule.find((entry) => entry.kind === 'golf')?.location, 'Faldo Course');
  assert.equal(schedule.find((entry) => entry.kind === 'golf')?.timeLabel, '09:20');
  assert.equal(schedule.find((entry) => entry.kind === 'golf')?.courseId, undefined);
});

test('itinerary headings always generate the full weekday and date', async () => {
  const info = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  const formatting = await readFile(new URL('../src/lib/formatting.ts', import.meta.url), 'utf8');
  assert.match(info, /formatLongDate\(date\)/);
  assert.doesNotMatch(info, /entries\.find\(\(entry\) => entry\.dayLabel\)/);
  assert.match(formatting, /weekday: 'long'/);
  assert.match(formatting, /month: 'long'/);
});

test('itinerary course-guide links require the saved round course id', async () => {
  const itinerary = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  const publicData = await readFile(new URL('../netlify/functions/_publicData.ts', import.meta.url), 'utf8');
  assert.match(itinerary, /entry\.courseId \? courses\.find/);
  assert.match(itinerary, /courseGuidePath\(guide\)/);
  assert.match(publicData, /tour info courses/);
  assert.match(publicData, /tourCourses: courseRows\.map\(mapCourseGuide\)/);
});

test('archived and future tour itinerary records remain isolated', async () => {
  const { buildTourSchedule } = await loadItineraryModule();
  const rows = [
    item('archive-hotel', 'tour-2026', 'Accommodation', { sourceType: 'accommodation' }),
    item('future-hotel', 'tour-2027', 'Accommodation', { sourceType: 'accommodation' }),
  ];
  const rounds = [round('archive-round', 'tour-2026'), round('future-round', 'tour-2027')];
  assert.deepEqual(buildTourSchedule('tour-2026', rounds, rows).map((entry) => entry.id), ['round-archive-round', 'archive-hotel']);
  assert.deepEqual(buildTourSchedule('tour-2027', rounds, rows).map((entry) => entry.id), ['round-future-round', 'future-hotel']);
});

test('Admin itinerary writes enforce practical categories and automatic chronological ordering', async () => {
  const saveFn = await readFile(new URL('../netlify/functions/admin-save-itinerary-item.ts', import.meta.url), 'utf8');
  assert.match(saveFn, /\['flight', 'travel', 'accommodation', 'dinner'\]/);
  assert.match(saveFn, /Flights require departure and landing times/);
  assert.match(saveFn, /end_time_label: endTimeLabel/);
  assert.match(saveFn, /automaticSortOrder/);
  assert.match(saveFn, /tour_id: tourId/);
});

test('Admin itinerary uses real flight times and hides internal sort controls', async () => {
  const component = await readFile(new URL('../src/components/AdminTourItinerary.tsx', import.meta.url), 'utf8');
  assert.match(component, /'Departure time'/);
  assert.match(component, /'Landing time'/);
  assert.match(component, /type="time"/);
  assert.doesNotMatch(component, />Sort order</);
});

test('team shirt colours have tour-scoped admin read, save and delete paths', async () => {
  const adminData = await readFile(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8');
  const saveKit = await readFile(new URL('../netlify/functions/admin-save-team-day-kit.ts', import.meta.url), 'utf8');
  const deleteKit = await readFile(new URL('../netlify/functions/admin-delete-team-day-kit.ts', import.meta.url), 'utf8');
  assert.match(adminData, /tour_team_day_kit/);
  assert.match(adminData, /teamDayKit: kitRows\.map\(mapTourTeamDayKit\)/);
  assert.match(saveKit, /\.eq\('id', teamId\)\.eq\('tour_id', tourId\)/);
  assert.match(saveKit, /\.eq\('team_id', teamId\)\.eq\('kit_date', kitDate\)/);
  assert.match(saveKit, /targetId/);
  assert.match(deleteKit, /\.eq\('id', id\)\.eq\('tour_id', tourId\)/);
});

test('the 2026 helper no longer creates or deletes schedule placeholders', async () => {
  const template = await readFile(new URL('../netlify/functions/admin-apply-2026-format-template.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(template, /const itinerary =/);
  assert.doesNotMatch(template, /tour_itinerary_items'\)\.(?:insert|delete)/);
  assert.match(template, /tour_itinerary_items'\)\.select/);
});

test('public Tour information is a single schedule with daily shirts and no handbook cards', async () => {
  const info = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  const publicData = await readFile(new URL('../netlify/functions/_publicData.ts', import.meta.url), 'utf8');
  assert.match(info, /title="Itinerary"/);
  assert.match(info, /First tee/);
  assert.match(info, /Team shirt colours/);
  assert.match(info, /Itinerary TBC\./);
  assert.doesNotMatch(info, /Key notes|handbookSections\.map|Secondary prize/);
  assert.match(publicData, /activeManualItineraryItems/);
  assert.match(publicData, /handbookSections: \[\]/);
});

test('itinerary day tabs use the Roegusta dark green and gold treatment', async () => {
  const css = await readFile(new URL('../src/styles/experience.css', import.meta.url), 'utf8');
  const tabsRule = css.match(/\.itinerary-day-tabs\s*{[^}]+}/s)?.[0] ?? '';
  const activeRule = css.match(/\.itinerary-day-tabs button\.is-active\s*{[^}]+}/s)?.[0] ?? '';
  assert.match(tabsRule, /--rt-green-950,\s*#062b22/);
  assert.match(tabsRule, /--rt-green-850,\s*#0a3e34/);
  assert.match(activeRule, /--rt-gold/);
});

test('public itinerary uses selectable day tabs and a visual event timeline', async () => {
  const info = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  assert.match(info, /role="tablist"/);
  assert.match(info, /role="tabpanel"/);
  assert.match(info, /itinerary-event-rail/);
  assert.match(info, /formatItineraryTime/);
  assert.match(info, /tourDateRange\(startDate, endDate\)/);
});

test('flight arrival-time migration is additive and preserves existing itinerary rows', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607260001_itinerary_flight_times.sql', import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists end_time_label text/);
  assert.match(migration, /set source_type = 'flight'/);
  assert.doesNotMatch(migration, /\bdelete\b|\btruncate\b/i);
});

test('Bet Punto CSS stacks tables on mobile instead of requiring horizontal scrolling', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.betting-page \.bet-summary-table thead\s*{\s*display: none;/);
  assert.match(css, /\.betting-page \.bet-summary-table td\s*{[^}]*grid-template-columns/s);
  assert.match(css, /overflow-wrap: anywhere/);
});
