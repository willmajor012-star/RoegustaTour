import type { CourseGuide } from './types';

type InstallOptions = {
  published: boolean;
  showOnHome: boolean;
};

export function courseTemplateRow(
  course: CourseGuide,
  tourId: string,
  sortOrder: number,
  options: InstallOptions,
) {
  return {
    id: crypto.randomUUID(),
    tour_id: tourId,
    slug: course.slug,
    name: course.name,
    short_name: course.shortName,
    resort: course.resort || null,
    location: course.location || null,
    architect: course.architect || null,
    opened: course.opened || null,
    overview: course.overview || null,
    note_availability: course.noteAvailability,
    official_page_url: course.officialPageUrl || null,
    scorecard_url: course.scorecardUrl || null,
    hero_image_url: course.heroImageUrl || null,
    hero_position: course.heroPosition || null,
    tees: course.tees,
    holes: course.holes,
    sort_order: sortOrder,
    published: options.published,
    show_on_home: options.showOnHome,
    updated_at: new Date().toISOString(),
  };
}
