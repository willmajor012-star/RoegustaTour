import type { CourseGuide as SharedCourseGuide, CourseHole as SharedCourseHole, CourseTee as SharedCourseTee, Round, Tour } from '../lib/types';

export type CourseTee = SharedCourseTee;
export type CourseHole = SharedCourseHole;
export type CourseGuide = SharedCourseGuide;

type MetricCourseHole = {
  number: number;
  par: number;
  strokeIndex: number;
  metres: Record<string, number>;
  officialNote?: string;
};

const amendoeiraTees: CourseTee[] = [
  { key: 'gold', label: 'Gold', colour: '#c8a64d', textColour: '#102f24' },
  { key: 'white', label: 'White', colour: '#f7f3e9', textColour: '#102f24' },
  { key: 'yellow', label: 'Yellow', colour: '#f0cb3c', textColour: '#102f24' },
  { key: 'blue', label: 'Blue', colour: '#447ab8' },
  { key: 'red', label: 'Red', colour: '#ae3c45' },
];

const oldCourseTees: CourseTee[] = [
  { key: 'white', label: 'White', colour: '#f7f3e9', textColour: '#102f24' },
  { key: 'yellow', label: 'Yellow', colour: '#f0cb3c', textColour: '#102f24' },
  { key: 'blue', label: 'Blue', colour: '#447ab8' },
  { key: 'red', label: 'Red', colour: '#ae3c45' },
];

const faldoHoles: MetricCourseHole[] = [
  { number: 1, par: 4, strokeIndex: 7, metres: { gold: 415, white: 410, yellow: 388, blue: 362, red: 320 } },
  { number: 2, par: 3, strokeIndex: 17, metres: { gold: 174, white: 169, yellow: 147, blue: 126, red: 96 } },
  { number: 3, par: 4, strokeIndex: 11, metres: { gold: 324, white: 319, yellow: 310, blue: 268, red: 214 } },
  { number: 4, par: 5, strokeIndex: 3, metres: { gold: 546, white: 520, yellow: 478, blue: 433, red: 388 } },
  { number: 5, par: 4, strokeIndex: 9, metres: { gold: 365, white: 336, yellow: 309, blue: 281, red: 236 } },
  { number: 6, par: 5, strokeIndex: 5, metres: { gold: 541, white: 517, yellow: 489, blue: 461, red: 414 } },
  { number: 7, par: 3, strokeIndex: 13, metres: { gold: 199, white: 194, yellow: 181, blue: 154, red: 125 } },
  { number: 8, par: 4, strokeIndex: 1, metres: { gold: 388, white: 363, yellow: 335, blue: 317, red: 276 } },
  { number: 9, par: 4, strokeIndex: 15, metres: { gold: 355, white: 350, yellow: 325, blue: 264, red: 218 } },
  { number: 10, par: 4, strokeIndex: 8, metres: { gold: 458, white: 445, yellow: 433, blue: 418, red: 373 } },
  { number: 11, par: 3, strokeIndex: 16, metres: { gold: 149, white: 132, yellow: 115, blue: 105, red: 96 } },
  { number: 12, par: 4, strokeIndex: 6, metres: { gold: 319, white: 314, yellow: 299, blue: 286, red: 253 } },
  { number: 13, par: 5, strokeIndex: 2, metres: { gold: 613, white: 591, yellow: 521, blue: 485, red: 449 } },
  { number: 14, par: 4, strokeIndex: 10, metres: { gold: 348, white: 343, yellow: 327, blue: 281, red: 259 } },
  { number: 15, par: 4, strokeIndex: 14, metres: { gold: 367, white: 332, yellow: 303, blue: 267, red: 244 } },
  { number: 16, par: 3, strokeIndex: 18, metres: { gold: 138, white: 124, yellow: 112, blue: 106, red: 83 } },
  { number: 17, par: 4, strokeIndex: 4, metres: { gold: 403, white: 372, yellow: 353, blue: 315, red: 286 } },
  { number: 18, par: 5, strokeIndex: 12, metres: { gold: 496, white: 465, yellow: 433, blue: 405, red: 373 } },
];

const oconnorHoles: MetricCourseHole[] = [
  { number: 1, par: 5, strokeIndex: 11, metres: { gold: 546, white: 513, yellow: 497, blue: 476, red: 470 } },
  { number: 2, par: 4, strokeIndex: 7, metres: { gold: 365, white: 323, yellow: 301, blue: 267, red: 234 } },
  { number: 3, par: 3, strokeIndex: 15, metres: { gold: 162, white: 148, yellow: 139, blue: 124, red: 113 } },
  { number: 4, par: 4, strokeIndex: 3, metres: { gold: 410, white: 373, yellow: 358, blue: 341, red: 325 } },
  { number: 5, par: 5, strokeIndex: 17, metres: { gold: 487, white: 473, yellow: 456, blue: 448, red: 418 } },
  { number: 6, par: 3, strokeIndex: 9, metres: { gold: 195, white: 165, yellow: 151, blue: 142, red: 126 } },
  { number: 7, par: 4, strokeIndex: 5, metres: { gold: 377, white: 361, yellow: 346, blue: 318, red: 296 } },
  { number: 8, par: 4, strokeIndex: 1, metres: { gold: 402, white: 371, yellow: 330, blue: 291, red: 270 } },
  { number: 9, par: 4, strokeIndex: 13, metres: { gold: 418, white: 397, yellow: 381, blue: 373, red: 366 } },
  { number: 10, par: 4, strokeIndex: 6, metres: { gold: 404, white: 390, yellow: 376, blue: 363, red: 331 } },
  { number: 11, par: 5, strokeIndex: 14, metres: { gold: 511, white: 500, yellow: 472, blue: 441, red: 402 } },
  { number: 12, par: 4, strokeIndex: 8, metres: { gold: 393, white: 353, yellow: 335, blue: 319, red: 305 } },
  { number: 13, par: 3, strokeIndex: 18, metres: { gold: 155, white: 147, yellow: 132, blue: 130, red: 116 } },
  { number: 14, par: 4, strokeIndex: 2, metres: { gold: 430, white: 381, yellow: 344, blue: 336, red: 309 } },
  { number: 15, par: 4, strokeIndex: 4, metres: { gold: 404, white: 386, yellow: 360, blue: 352, red: 317 } },
  { number: 16, par: 5, strokeIndex: 12, metres: { gold: 503, white: 485, yellow: 473, blue: 460, red: 429 } },
  { number: 17, par: 3, strokeIndex: 16, metres: { gold: 172, white: 151, yellow: 150, blue: 139, red: 114 } },
  { number: 18, par: 4, strokeIndex: 10, metres: { gold: 374, white: 356, yellow: 338, blue: 320, red: 301 } },
];

const oldCourseHoles: MetricCourseHole[] = [
  { number: 1, par: 4, strokeIndex: 17, metres: { white: 310, yellow: 302, blue: 296, red: 282 }, officialNote: 'A downhill opener: favour position before approaching between the front bunkers.' },
  { number: 2, par: 5, strokeIndex: 5, metres: { white: 435, yellow: 417, blue: 407, red: 375 }, officialNote: 'A rising par five; avoid the left bunker and hidden plateau.' },
  { number: 3, par: 4, strokeIndex: 9, metres: { white: 324, yellow: 300, blue: 290, red: 252 }, officialNote: 'Stay clear of the left umbrella pine to open the green.' },
  { number: 4, par: 3, strokeIndex: 15, metres: { white: 163, yellow: 149, blue: 139, red: 113 }, officialNote: 'Carry the pond and front bunker into the broad green.' },
  { number: 5, par: 4, strokeIndex: 3, metres: { white: 413, yellow: 340, blue: 330, red: 303 }, officialNote: 'Position carefully between sand and pines for a clean approach.' },
  { number: 6, par: 3, strokeIndex: 11, metres: { white: 212, yellow: 196, blue: 181, red: 164 }, officialNote: 'The longest par three plays downhill over the front bunkers.' },
  { number: 7, par: 4, strokeIndex: 7, metres: { white: 393, yellow: 344, blue: 334, red: 312 }, officialNote: 'Follow the uphill dogleg and allow extra club into the green.' },
  { number: 8, par: 4, strokeIndex: 1, metres: { white: 419, yellow: 400, blue: 390, red: 354 }, officialNote: 'The hardest hole bends uphill left toward a long hidden green.' },
  { number: 9, par: 4, strokeIndex: 13, metres: { white: 265, yellow: 250, blue: 250, red: 245 }, officialNote: 'A tactical short par four where tee position matters most.' },
  { number: 10, par: 3, strokeIndex: 18, metres: { white: 153, yellow: 148, blue: 138, red: 114 }, officialNote: 'Carry the depression and avoid leaving a short recovery.' },
  { number: 11, par: 4, strokeIndex: 4, metres: { white: 390, yellow: 371, blue: 357, red: 329 }, officialNote: 'Drive between bunkers before the rising approach through the pines.' },
  { number: 12, par: 5, strokeIndex: 6, metres: { white: 487, yellow: 482, blue: 472, red: 359 }, officialNote: 'Turn right, then climb through the narrow pine corridor.' },
  { number: 13, par: 4, strokeIndex: 16, metres: { white: 348, yellow: 342, blue: 332, red: 296 }, officialNote: 'Position before the ditch for the downhill approach.' },
  { number: 14, par: 5, strokeIndex: 8, metres: { white: 440, yellow: 426, blue: 405, red: 342 }, officialNote: 'A reachable par five: attack or lay up below the green.' },
  { number: 15, par: 3, strokeIndex: 14, metres: { white: 150, yellow: 145, blue: 135, red: 106 }, officialNote: 'Carry the hollow onto a wide but shallow bunkered green.' },
  { number: 16, par: 5, strokeIndex: 2, metres: { white: 514, yellow: 494, blue: 484, red: 428 }, officialNote: 'Favour the narrow fairway’s left before laying up.' },
  { number: 17, par: 4, strokeIndex: 12, metres: { white: 353, yellow: 348, blue: 338, red: 312 }, officialNote: 'Choose distance or position on this uphill dogleg left.' },
  { number: 18, par: 5, strokeIndex: 10, metres: { white: 485, yellow: 449, blue: 440, red: 400 }, officialNote: 'Drive right-centre through the pines before the closing approach.' },
];

export const courseGuides: CourseGuide[] = [
  {
    slug: 'faldo',
    name: 'Faldo Course',
    shortName: 'Faldo',
    resort: 'Amendoeira Golf Resort',
    location: 'Alcantarilha, Algarve',
    architect: 'Sir Nick Faldo',
    opened: '2008',
    overview: 'A strategic, elevated par-72 layout where careful positioning is central to scoring. The course moves through rolling Algarve terrain with exposed views and a deliberately demanding championship profile.',
    noteAvailability: 'course-only',
    officialPageUrl: 'https://www.amendoeiraresort.com/en/golf/',
    scorecardUrl: 'https://amendoeira.backhotelite.com/uploads/files/cms_apps/pdf/faldo/Faldo_Course_Scorecard.pdf',
    heroImageUrl: 'https://www.amendoeiraresort.com/media/uploads/page_setup_images/AGR_Faldo_13Tee_2_amendoeira.jpg?q=pr:sharp/rs:fill/w:1920/h:1080/g:ce/f:jpg',
    heroPosition: 'center',
    tees: amendoeiraTees,
    holes: toYardHoles(faldoHoles),
  },
  {
    slug: 'oconnor',
    name: "O'Connor Jnr. Course",
    shortName: "O'Connor",
    resort: 'Amendoeira Golf Resort',
    location: 'Alcantarilha, Algarve',
    architect: "Christy O'Connor Jnr.",
    opened: '2008',
    overview: 'A par-72 valley course shaped around lakes and water hazards. It provides a greener, lower-lying contrast to the Faldo Course and rewards accurate placement throughout the round.',
    noteAvailability: 'course-only',
    officialPageUrl: 'https://www.amendoeiraresort.com/en/golf/',
    scorecardUrl: 'https://amendoeira.backhotelite.com/uploads/files/cms_apps/pdf/oconnor/Oconnor_Jnr._Scorecard.pdf',
    heroImageUrl: 'https://www.amendoeiraresort.com/media/uploads/page_setup_images/AGR_Oconner_Tee_18_Amendoeira.jpg?q=pr:sharp/rs:fill/w:1920/h:1080/g:ce/f:jpg',
    heroPosition: 'center',
    tees: amendoeiraTees,
    holes: toYardHoles(oconnorHoles),
  },
  {
    slug: 'old-course',
    name: 'Old Course',
    shortName: 'Old Course',
    resort: 'Vilamoura Golf',
    location: 'Vilamoura, Algarve',
    architect: 'Frank Pennink',
    opened: '1969',
    overview: 'A historic par-73 course routed through mature umbrella pines and rolling fairways. Its traditional shape, narrow corridors and natural contours make position and club selection more important than raw power.',
    noteAvailability: 'hole-by-hole',
    officialPageUrl: 'https://www.vilamouragolf.com/en/golf-courses/old-course/',
    scorecardUrl: 'https://www.vilamouragolf.com/wp-content/uploads/2026/06/Old-Course_ScoreCards_148x105mm_digital.pdf',
    heroImageUrl: 'https://www.vilamouragolf.com/wp-content/uploads/2026/03/oldcourse-photos.jpg',
    heroPosition: 'center',
    tees: oldCourseTees,
    holes: toYardHoles(oldCourseHoles),
  },
];

export function metresToYards(metres: number) {
  return Math.round(metres * 1.0936133);
}

function toYardHoles(holes: MetricCourseHole[]): CourseHole[] {
  return holes.map(({ metres, ...hole }) => ({
    ...hole,
    yards: Object.fromEntries(Object.entries(metres).map(([tee, distance]) => [tee, metresToYards(distance)])),
  }));
}

export function totalPar(course: CourseGuide) {
  return course.holes.reduce((sum, hole) => sum + hole.par, 0);
}

export function totalYards(course: CourseGuide, teeKey: string) {
  return course.holes.reduce((sum, hole) => sum + (hole.yards[teeKey] ?? 0), 0);
}

export function findCourseGuide(slug?: string, courses: CourseGuide[] = courseGuides) {
  return courses.find((course) => course.slug === slug);
}

export function courseGuideForName(courseName?: string | null, courses: CourseGuide[] = courseGuides) {
  const normalized = courseName?.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim() ?? '';
  if (!normalized) return undefined;
  return courses.find((course) => {
    const candidates = [course.name, course.shortName, course.slug].map((value) => value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim());
    return candidates.some((candidate) => candidate === normalized || normalized.includes(candidate) || candidate.includes(normalized));
  });
}

export function courseGuideForRound(round: Pick<Round, 'courseId' | 'courseName'> | undefined, courses: CourseGuide[]) {
  if (!round) return undefined;
  return (round.courseId ? courses.find((course) => course.id === round.courseId) : undefined) ?? courseGuideForName(round.courseName, courses);
}

export function courseGuidesForTour(tour: Tour | undefined, rounds: Round[], savedCourses: CourseGuide[]) {
  const publishedCourses = savedCourses.filter((course) => course.published !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (publishedCourses.length > 0) return publishedCourses;
  if (tour?.year !== 2026) return [];
  const matched = courseGuides.filter((course) => rounds.some((round) => courseGuideForName(round.courseName, [course])));
  return matched.length > 0 ? matched : courseGuides;
}

export function courseGuidePath(course: Pick<CourseGuide, 'slug'>) {
  return `/courses/${course.slug}`;
}
