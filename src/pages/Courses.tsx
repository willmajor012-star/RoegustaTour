import { CourseRail } from '../components/CourseRail';
import { PageHeader } from '../components/PageHeader';

export function Courses() {
  return (
    <div className="page-stack courses-page">
      <PageHeader
        eyebrow="Roegusta Tour 2026"
        title="Courses"
        description="Official course information and scorecards converted to yards."
      />
      <CourseRail title="Choose a course" eyebrow="Faldo · O'Connor · Old Course" />
      <section className="card course-source-note">
        <p className="eyebrow">Source standard</p>
        <h3>Course information without the filler</h3>
        <p>Scorecard figures come from the current course scorecards. The Old Course publishes an official hole-by-hole guide; Amendoeira currently publishes course-level notes only, so Faldo and O’Connor do not contain invented hole strategy.</p>
      </section>
    </div>
  );
}
