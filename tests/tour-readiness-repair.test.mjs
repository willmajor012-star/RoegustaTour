import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

async function loadTsModule(relativePath) {
  const input = await source(relativePath);
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
}

test('fresh schema puts Home visibility on course guides, never teams', async () => {
  const schema = await source('supabase/schema.sql');
  const teams = schema.match(/create table tour_teams \(([\s\S]*?)\n\);/)?.[1] ?? '';
  const courses =
    schema.match(/create table tour_courses \(([\s\S]*?)\n\);/)?.[1] ?? '';

  assert.doesNotMatch(teams, /show_on_home/);
  assert.match(courses, /show_on_home boolean not null default true/);
  assert.match(
    schema,
    /tour_courses_home_visibility_idx on tour_courses\(tour_id, published, show_on_home, sort_order\)/,
  );
});

test('operational tour dates are strict and cannot silently remain partial', async () => {
  const { validateTourDateRange } = await loadTsModule(
    'src/lib/tourValidation.ts',
  );

  assert.equal(
    validateTourDateRange('2026-11-06', null, true),
    'Start date and end date are required for a planned, active or complete tour.',
  );
  assert.equal(
    validateTourDateRange('2026-02-30', '2026-03-01', true),
    'Tour start date is invalid.',
  );
  assert.equal(
    validateTourDateRange('2026-11-06', '2026-11-09', true),
    null,
  );

  const saveTour = await source('netlify/functions/admin-save-tour.ts');
  assert.match(saveTour, /saved\.start_date !== startDate/);
  assert.match(saveTour, /saved\.end_date !== endDate/);
});

test('2026 setup installs all library guides and links only matching rounds by slug', async () => {
  const setup = await source(
    'netlify/functions/admin-apply-2026-format-template.ts',
  );
  const migration = await source(
    'supabase/migrations/202607250003_tour_readiness_repair.sql',
  );
  const editor = await source('src/components/AdminCourseEditor.tsx');
  const installer = await source(
    'netlify/functions/admin-install-course-templates.ts',
  );

  assert.match(
    setup,
    /\['faldo', 'oconnor', 'old-course'\][\s\S]*published: true, showOnHome: true/,
  );
  assert.match(setup, /course_slug: 'faldo'/);
  assert.match(setup, /course_slug: 'old-course'/);
  assert.match(
    setup,
    /courseRows\.find\(\(course\) => course\.slug === round\.course_slug\)/,
  );
  assert.match(
    setup,
    /Friday Par 3 Pairs Scramble[\s\S]*course_name: 'Amendoeira Par 3'/,
  );
  assert.doesNotMatch(
    setup.match(
      /\{ round_number: 1,[^\n]+Friday Par 3 Pairs Scramble[^\n]+\}/,
    )?.[0] ?? '',
    /course_slug/,
  );
  assert.match(setup, /round_number: 2,[^\n]+course_slug: 'faldo'/);
  assert.match(setup, /round_number: 4,[^\n]+course_slug: 'oconnor'/);
  assert.match(editor, /Install missing 2026 guide set/);
  assert.match(editor, /Existing saved guides were preserved/);
  assert.match(installer, /installCourseTemplatesForTour/);
  for (const slug of ['faldo', 'oconnor', 'old-course']) {
    assert.match(migration, new RegExp(`"slug":"${slug}"`));
  }
  assert.match(migration, /on conflict \(tour_id, slug\) do nothing/);
  assert.match(migration, /round_row\.round_number = 1 and course\.slug = 'faldo'/);
  assert.match(migration, /round_row\.round_number = 3 and course\.slug = 'old-course'/);
  assert.doesNotMatch(migration, /delete from public\.tour_courses/);
});

test('library templates become complete tour-owned rows with independent Home visibility', async () => {
  const { courseTemplateRow } = await loadTsModule(
    'src/lib/courseTemplateRows.ts',
  );
  const template = {
    slug: 'test-course',
    name: 'Test Course',
    shortName: 'Test',
    resort: 'Resort',
    location: 'Portugal',
    architect: 'Architect',
    overview: 'Overview',
    noteAvailability: 'course-only',
    tees: [{ key: 'white', label: 'White', colour: '#ffffff' }],
    holes: [
      { number: 1, par: 4, strokeIndex: 1, yards: { white: 400 } },
    ],
  };

  const row = courseTemplateRow(template, 'tour-id', 2, {
    published: true,
    showOnHome: false,
  });

  assert.equal(row.tour_id, 'tour-id');
  assert.equal(row.slug, 'test-course');
  assert.equal(row.short_name, 'Test');
  assert.equal(row.published, true);
  assert.equal(row.show_on_home, false);
  assert.deepEqual(row.holes, template.holes);
});

test('context help is placed inside complex workflows, not only once per tab', async () => {
  const files = await Promise.all(
    [
      'src/pages/Admin.tsx',
      'src/components/AdminCourseEditor.tsx',
      'src/components/AdminTourItinerary.tsx',
      'src/components/AdminLiveDesk.tsx',
    ].map(source),
  );
  const combined = files.join('\n');
  const placements =
    combined.match(/<AdminContextHelpButton\b/g)?.length ?? 0;

  assert.ok(placements >= 20, `expected at least 20 contextual placements, got ${placements}`);
  for (const label of [
    'Bulk attendance and tour profiles',
    '2026 rounds and course-guide setup',
    'Sequential match tee times',
    'Secondary prize winner and Bet Punto settlement',
    'Manual Bet Punto corrections',
    'Course hole data',
    'Daily team shirt colours',
  ]) {
    assert.match(combined, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('completed QA tours are explicitly disposable while real history stays protected', async () => {
  const migration = await source(
    'supabase/migrations/202607250003_tour_readiness_repair.sql',
  );
  const deleteTour = await source('netlify/functions/admin-delete-tour.ts');
  const admin = await source('src/pages/Admin.tsx');

  assert.match(migration, /add column if not exists is_test/);
  assert.match(migration, /QA TEST TOUR%/);
  assert.match(deleteTour, /if \(tour\.is_test\)/);
  assert.match(deleteTour, /confirmationName !== tour\.name/);
  assert.match(deleteTour, /\.eq\('is_test', true\)/);
  assert.match(deleteTour, /protectedYears/);
  assert.match(admin, /Disposable QA test tour/);
  assert.match(admin, /Type the exact name to continue/);
});
