import { CourseRail } from '../components/CourseRail';
import { PageHeader } from '../components/PageHeader';
import { courseGuidesForTour } from '../data/courseGuides';
import { fetchPublicCourses, type PublicCoursesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

const emptyCourseData: Omit<PublicCoursesResponse, 'source'> = { tour: undefined, rounds: [], tourCourses: [] };

export function Courses() {
  const { data, loading, error } = usePublicData(fetchPublicCourses);
  const activeData = data ?? emptyCourseData;
  const courses = courseGuidesForTour(activeData.tour, activeData.rounds, activeData.tourCourses);
  return (
    <div className="page-stack courses-page">
      <PageHeader
        eyebrow={activeData.tour?.name ?? 'Current tour'}
        title="Courses"
      />
      {loading && <p className="card">Loading course guides…</p>}
      {error && <p className="card form-error">Course guides could not be loaded. Please refresh.</p>}
      {!loading && !error && <CourseRail title="Choose a course" eyebrow={courses.map((course) => course.shortName).join(' · ') || 'Course preparation'} courses={courses} />}
      <section className="card course-source-note">
        <p className="eyebrow">Source standard</p>
        <h3>Course information without the filler</h3>
        <p>Scorecards and commentary are shown from the official information saved for this tour. Where a course does not publish hole-by-hole notes, the guide shows the verified scorecard without invented strategy.</p>
      </section>
    </div>
  );
}
