import { jsonResponse, type FunctionEvent, type FunctionResponse } from './_adminAuth';
import { badRequest, optionalNumber, optionalString, runRows, runSingle, withAdminSupabase } from './_adminSupabase';
import { mapCourseGuide } from './_mappers';
import type { CourseGuide, CourseHole, CourseTee } from '../../src/lib/types';

type Handler = (event: FunctionEvent) => Promise<FunctionResponse>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function parseTees(value: unknown): CourseTee[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const tees = value.map((entry) => {
    const row = record(entry);
    return {
      key: optionalString(row.key) ?? '',
      label: optionalString(row.label) ?? '',
      colour: optionalString(row.colour) ?? '#0f2f24',
      textColour: optionalString(row.textColour) ?? undefined,
    };
  });
  const keys = tees.map((tee) => tee.key);
  if (tees.some((tee) => !/^[a-z0-9-]{1,32}$/.test(tee.key) || !tee.label) || new Set(keys).size !== keys.length) return null;
  return tees;
}

function parseHoles(value: unknown, tees: CourseTee[]): CourseHole[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 36) return null;
  const holes = value.map((entry) => {
    const row = record(entry);
    const rawYards = record(row.yards);
    return {
      number: optionalNumber(row.number) ?? 0,
      par: optionalNumber(row.par) ?? 0,
      strokeIndex: optionalNumber(row.strokeIndex) ?? 0,
      yards: Object.fromEntries(tees.map((tee) => [tee.key, optionalNumber(rawYards[tee.key]) ?? 0])),
      officialNote: optionalString(row.officialNote) ?? undefined,
    };
  }).sort((a, b) => a.number - b.number);
  const numbers = holes.map((hole) => hole.number);
  if (new Set(numbers).size !== numbers.length || holes.some((hole, index) => (
    hole.number !== index + 1
    || !Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6
    || !Number.isInteger(hole.strokeIndex) || hole.strokeIndex < 1 || hole.strokeIndex > holes.length
    || tees.some((tee) => !Number.isInteger(hole.yards[tee.key]) || hole.yards[tee.key] < 1 || hole.yards[tee.key] > 999)
  ))) return null;
  return holes;
}

export const handler: Handler = (event) => withAdminSupabase(event, 'POST', async (supabase, body) => {
  const id = optionalString(body.id);
  const tourId = optionalString(body.tourId);
  const slug = optionalString(body.slug)?.toLowerCase();
  const name = optionalString(body.name);
  const shortName = optionalString(body.shortName);
  const tees = parseTees(body.tees);
  const holes = tees ? parseHoles(body.holes, tees) : null;
  const noteAvailability = optionalString(body.noteAvailability) as CourseGuide['noteAvailability'] | null;
  const sortOrder = optionalNumber(body.sortOrder) ?? 0;
  const published = body.published === true;
  const showOnHome = body.showOnHome === true;

  if (!tourId) return badRequest('Tour ID is required.');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return badRequest('Course slug must use lowercase letters, numbers and single hyphens.');
  if (!name || !shortName) return badRequest('Course name and short name are required.');
  if (!tees) return badRequest('Add between one and eight uniquely named tees.');
  if (!holes) return badRequest('Hole rows must be consecutive and include valid par, stroke index and yardage for every tee.');
  if (!noteAvailability || !['course-only', 'hole-by-hole'].includes(noteAvailability)) return badRequest('Course commentary setting is invalid.');
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 99) return badRequest('Course sort order is invalid.');

  const tours = await runRows<{ id: string }>(supabase.from('tours').select('id').eq('id', tourId).limit(1), 'find course tour');
  if (tours.length === 0) return badRequest('Tour must exist.');
  if (id) {
    const existing = await runRows<{ id: string; tour_id: string }>(supabase.from('tour_courses').select('id, tour_id').eq('id', id).limit(1), 'find course');
    if (existing.length === 0) return badRequest('Course must exist.');
    if (existing[0].tour_id !== tourId) return badRequest('Course does not belong to this tour.');
  }
  const conflicts = await runRows<{ id: string }>(supabase.from('tour_courses').select('id').eq('tour_id', tourId).eq('slug', slug).limit(1), 'find course slug');
  if (conflicts.some((course) => course.id !== id)) return badRequest('Another course in this tour already uses that slug.');

  const row = {
    id: id ?? crypto.randomUUID(),
    tour_id: tourId,
    slug,
    name,
    short_name: shortName,
    resort: optionalString(body.resort),
    location: optionalString(body.location),
    architect: optionalString(body.architect),
    opened: optionalString(body.opened),
    overview: optionalString(body.overview),
    note_availability: noteAvailability,
    official_page_url: optionalString(body.officialPageUrl),
    scorecard_url: optionalString(body.scorecardUrl),
    hero_image_url: optionalString(body.heroImageUrl),
    hero_position: optionalString(body.heroPosition),
    tees,
    holes,
    sort_order: sortOrder,
    published,
    show_on_home: showOnHome,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from('tour_courses').update(row).eq('id', id).select('*').single()
    : supabase.from('tour_courses').insert(row).select('*').single();
  try {
    const saved = await runSingle<Record<string, unknown>>(query, 'save course');
    return jsonResponse(200, { ok: true, course: mapCourseGuide(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/tour_courses|course_id|schema cache|relation/i.test(message)) return badRequest('Course guide storage is not available yet. Run migration 0015_tour_courses_and_automatic_bet_defaults.sql and reload the Supabase schema cache.');
    throw error;
  }
});
