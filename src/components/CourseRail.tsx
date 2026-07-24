import type { CSSProperties } from 'react';
import { courseGuidePath, courseGuides } from '../data/courseGuides';

type Props = {
  title?: string;
  eyebrow?: string;
  compact?: boolean;
};

export function CourseRail({ title = 'Course guides', eyebrow = 'Three championship courses', compact = false }: Props) {
  return (
    <section className={`course-rail-section ${compact ? 'compact' : ''}`}>
      <div className="home-section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="course-card-rail">
        {courseGuides.map((course) => (
          <a
            className="course-launch-card"
            href={courseGuidePath(course)}
            key={course.slug}
            style={{ '--course-image': `url("${course.heroImageUrl}")`, '--course-position': course.heroPosition ?? 'center' } as CSSProperties}
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
    </section>
  );
}
