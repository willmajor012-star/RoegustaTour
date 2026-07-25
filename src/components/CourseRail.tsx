import type { CSSProperties } from 'react';
import { courseGuidePath } from '../data/courseGuides';
import type { CourseGuide } from '../lib/types';

type Props = {
  title?: string;
  eyebrow?: string;
  compact?: boolean;
  courses?: CourseGuide[];
};

export function CourseRail({ title = 'Course guides', eyebrow = 'Course preparation', compact = false, courses = [] }: Props) {
  return (
    <section className={`course-rail-section ${compact ? 'compact' : ''}`}>
      <div className="home-section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="course-card-rail">
        {courses.map((course) => (
          <a
            className="course-launch-card"
            href={courseGuidePath(course)}
            key={course.slug}
            style={{ '--course-image': course.heroImageUrl ? `url("${course.heroImageUrl}")` : 'none', '--course-position': course.heroPosition ?? 'center' } as CSSProperties}
          >
            <span className="course-launch-shade" aria-hidden="true" />
            <span className="course-launch-copy">
              <small>{course.resort}</small>
              <strong>{course.shortName}</strong>
              <span>{course.location}</span>
            </span>
            <b aria-hidden="true">›</b>
          </a>
        ))}
      </div>
      {courses.length === 0 && <p className="card">Course guides will appear once they are added and published for this tour.</p>}
    </section>
  );
}
