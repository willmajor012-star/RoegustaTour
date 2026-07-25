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

test('only travel, accommodation and dinner rows feed the manual itinerary', async () => {
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

test('Admin itinerary writes enforce the three practical manual categories', async () => {
  const saveFn = await readFile(new URL('../netlify/functions/admin-save-itinerary-item.ts', import.meta.url), 'utf8');
  assert.match(saveFn, /\['travel', 'accommodation', 'dinner'\]/);
  assert.match(saveFn, /Itinerary type must be travel, accommodation or dinner/);
  assert.match(saveFn, /tour_id: tourId/);
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
  assert.match(info, /title="Tour itinerary"/);
  assert.match(info, /First tee/);
  assert.match(info, /Team shirt colours/);
  assert.match(info, /Itinerary TBC\./);
  assert.doesNotMatch(info, /Key notes|handbookSections\.map|Secondary prize/);
  assert.match(publicData, /activeManualItineraryItems/);
  assert.match(publicData, /handbookSections: \[\]/);
});

test('itinerary day headings use a defined dark background so cream text remains visible', async () => {
  const css = await readFile(new URL('../src/styles/experience.css', import.meta.url), 'utf8');
  const headerRule = css.match(/\.itinerary-day-header\s*{[^}]+}/s)?.[0] ?? '';
  assert.match(headerRule, /--rt-green-950,\s*#062b22/);
  assert.match(headerRule, /--rt-green-850,\s*#0a3e34/);
  assert.doesNotMatch(headerRule, /--rt-green-800/);
});

test('Bet Punto CSS stacks tables on mobile instead of requiring horizontal scrolling', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.betting-page \.bet-summary-table thead\s*{\s*display: none;/);
  assert.match(css, /\.betting-page \.bet-summary-table td\s*{[^}]*grid-template-columns/s);
  assert.match(css, /overflow-wrap: anywhere/);
});
