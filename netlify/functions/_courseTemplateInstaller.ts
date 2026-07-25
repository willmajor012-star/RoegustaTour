import type { SupabaseClient } from '@supabase/supabase-js';
import { courseGuides } from '../../src/data/courseGuides';
import type { CourseGuide } from '../../src/lib/types';
import { courseTemplateRow } from '../../src/lib/courseTemplateRows';
import { runRows } from './_adminSupabase';

type InstallOptions = {
  published: boolean;
  showOnHome: boolean;
};

type SavedCourseIdentity = {
  id: string;
  slug: string;
  name: string;
};

export async function installCourseTemplatesForTour(
  supabase: SupabaseClient,
  tourId: string,
  templateSlugs: string[],
  options: InstallOptions,
) {
  const templates = templateSlugs.map((slug) =>
    courseGuides.find((course) => course.slug === slug),
  );
  if (templates.some((course) => !course)) {
    throw new Error('install course templates: one or more template slugs are invalid');
  }

  const existing = await runRows<SavedCourseIdentity>(
    supabase
      .from('tour_courses')
      .select('id, slug, name')
      .eq('tour_id', tourId),
    'load saved tour guides',
  );
  const existingSlugs = new Set(existing.map((course) => course.slug));
  const missingRows = templates
    .filter((course): course is CourseGuide => Boolean(course))
    .filter((course) => !existingSlugs.has(course.slug))
    .map((course, index) =>
      courseTemplateRow(course, tourId, index, options),
    );

  if (missingRows.length > 0) {
    const inserted = await runRows<SavedCourseIdentity>(
      supabase
        .from('tour_courses')
        .insert(missingRows)
        .select('id, slug, name'),
      'install course templates',
    );
    existing.push(...inserted);
  }

  return {
    courses: existing.filter((course) => templateSlugs.includes(course.slug)),
    createdSlugs: missingRows.map((course) => course.slug),
  };
}
