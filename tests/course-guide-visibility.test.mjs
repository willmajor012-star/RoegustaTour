import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadCourseGuideModule() {
  const source = await readFile(new URL('../src/data/courseGuides.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: 'courseGuides.ts',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

function tour(year) {
  return {
    id: `tour-${year}`,
    name: `Roegusta Tour ${year}`,
    year,
    status: 'planned',
  };
}

test('public courses never fall back to built-in templates or stale round names', async () => {
  const { courseGuidesForTour } = await loadCourseGuideModule();
  const staleRounds = [
    { courseName: 'Faldo Course' },
    { courseName: 'Par 3 Course' },
    { courseName: 'Old Course' },
  ];

  const courses = courseGuidesForTour(tour(2026), staleRounds, []);

  assert.deepEqual(courses, []);
});

test('a partial saved 2026 course set exposes only the saved published guide', async () => {
  const { courseGuides, courseGuidesForTour } = await loadCourseGuideModule();
  const savedFaldo = {
    ...structuredClone(courseGuides.find((course) => course.slug === 'faldo')),
    id: 'saved-faldo',
    tourId: 'tour-2026',
    overview: 'Saved tour-specific Faldo overview.',
    published: true,
    sortOrder: 0,
  };

  const courses = courseGuidesForTour(tour(2026), [], [savedFaldo]);

  assert.deepEqual(courses.map((course) => course.slug), ['faldo']);
  assert.equal(courses[0].id, 'saved-faldo');
  assert.equal(courses[0].overview, 'Saved tour-specific Faldo overview.');
});

test('round guide matching requires the selected saved guide id', async () => {
  const { courseGuides, courseGuideForRound } = await loadCourseGuideModule();
  const savedFaldo = {
    ...structuredClone(courseGuides.find((course) => course.slug === 'faldo')),
    id: 'saved-faldo',
    tourId: 'tour-2026',
    published: true,
  };

  assert.equal(courseGuideForRound({ courseId: 'saved-faldo', courseName: 'Wrong name' }, [savedFaldo])?.id, 'saved-faldo');
  assert.equal(courseGuideForRound({ courseName: 'Faldo Course' }, [savedFaldo]), undefined);
  assert.equal(courseGuideForRound({ courseId: 'missing', courseName: 'Faldo Course' }, [savedFaldo]), undefined);
});

test('future tours expose only their own published course snapshots', async () => {
  const { courseGuides, courseGuidesForTour } = await loadCourseGuideModule();
  const savedOConnor = {
    ...structuredClone(courseGuides.find((course) => course.slug === 'oconnor')),
    id: 'saved-oconnor',
    tourId: 'tour-2027',
    published: true,
  };
  const privateOldCourse = {
    ...structuredClone(courseGuides.find((course) => course.slug === 'old-course')),
    id: 'private-old-course',
    tourId: 'tour-2027',
    published: false,
  };

  const courses = courseGuidesForTour(tour(2027), [], [privateOldCourse, savedOConnor]);

  assert.deepEqual(courses.map((course) => course.slug), ['oconnor']);
});
