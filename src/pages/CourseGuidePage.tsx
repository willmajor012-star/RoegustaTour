import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { courseGuidePath, courseGuidesForTour, findCourseGuide, totalPar, totalYards, type CourseGuide } from '../data/courseGuides';
import { fetchPublicCourses, type PublicCoursesResponse } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';

type Props = {
  slug?: CourseGuide['slug'];
};

export function CourseGuidePage({ slug }: Props) {
  const { data, loading, error } = usePublicData(fetchPublicCourses);
  const activeData: Omit<PublicCoursesResponse, 'source'> = data ?? { tour: undefined, rounds: [], tourCourses: [] };
  const courses = courseGuidesForTour(activeData.tour, activeData.rounds, activeData.tourCourses);
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const routeSlug = slug ?? decodeURIComponent(pathParts[pathParts.length - 1] ?? '');
  const course = findCourseGuide(routeSlug, courses);
  const [selectedTee, setSelectedTee] = useState('yellow');
  const [selectedHoleNumber, setSelectedHoleNumber] = useState(1);

  useEffect(() => {
    if (!course) return;
    setSelectedTee(course.tees.some((tee) => tee.key === 'yellow') ? 'yellow' : course.tees[0]?.key ?? '');
    setSelectedHoleNumber(1);
  }, [course]);

  const selectedHole = course?.holes.find((hole) => hole.number === selectedHoleNumber) ?? course?.holes[0];
  const selectedTeeDetails = course?.tees.find((tee) => tee.key === selectedTee) ?? course?.tees[0];
  const frontNine = useMemo(() => course?.holes.slice(0, 9) ?? [], [course]);
  const backNine = useMemo(() => course?.holes.slice(9) ?? [], [course]);

  if (loading && !course) return <div className="page-stack"><p className="card">Loading course guide…</p></div>;
  if (error && !course) return <div className="page-stack"><p className="card form-error">Course guide could not be loaded. Please refresh.</p></div>;
  if (!course) return <div className="page-stack"><p className="card">This course guide is not published for the current tour.</p></div>;

  const moveHole = (direction: -1 | 1) => {
    const next = Math.min(course.holes.length, Math.max(1, selectedHoleNumber + direction));
    setSelectedHoleNumber(next);
  };

  return (
    <div className="page-stack course-guide-page">
      <nav className="course-guide-topbar" aria-label="Course guide navigation">
        <a href="/courses">‹ All courses</a>
        <div className="course-switcher">
          {courses.map((candidate) => <a className={candidate.slug === course.slug ? 'active' : ''} href={courseGuidePath(candidate)} key={candidate.slug}>{candidate.shortName}</a>)}
        </div>
      </nav>

      <header
        className="course-guide-hero"
        style={{ '--course-image': course.heroImageUrl ? `url("${course.heroImageUrl}")` : 'none', '--course-position': course.heroPosition ?? 'center' } as CSSProperties}
      >
        <span className="course-hero-shade" aria-hidden="true" />
        <div className="course-hero-copy">
          <p className="eyebrow">{course.resort}</p>
          <h2>{course.name}</h2>
          <p>{course.location}</p>
          <div className="course-hero-facts">
            <span><small>Par</small><strong>{totalPar(course)}</strong></span>
            <span><small>Holes</small><strong>{course.holes.length}</strong></span>
            <span><small>Architect</small><strong>{course.architect}</strong></span>
          </div>
        </div>
      </header>

      <section className="card course-overview-card">
        <div>
          <p className="eyebrow">Official course overview</p>
          <h3>{course.architect}{course.opened ? ` · ${course.opened}` : ''}</h3>
          <p>{course.overview}</p>
        </div>
        <div className="course-source-links">
          {course.officialPageUrl && <a href={course.officialPageUrl} target="_blank" rel="noreferrer">Official course page ↗</a>}
          {course.scorecardUrl && <a href={course.scorecardUrl} target="_blank" rel="noreferrer">Official scorecard ↗</a>}
        </div>
      </section>

      <section className="course-scorecard-section">
        <div className="course-section-heading">
          <div><p className="eyebrow">Scorecard</p><h2>All distances in yards</h2></div>
          <span>{selectedTeeDetails?.label ?? 'Tee'} · {selectedTeeDetails ? totalYards(course, selectedTeeDetails.key).toLocaleString('en-GB') : '—'} yds</span>
        </div>
        <div className="course-tee-switch" role="tablist" aria-label="Scorecard tee">
          {course.tees.map((tee) => (
            <button
              type="button"
              role="tab"
              aria-selected={selectedTee === tee.key}
              className={selectedTee === tee.key ? 'active' : ''}
              onClick={() => setSelectedTee(tee.key)}
              key={tee.key}
              style={{ '--tee-colour': tee.colour, '--tee-text': tee.textColour ?? '#fff' } as CSSProperties}
            >
              <i aria-hidden="true" />
              {tee.label}
            </button>
          ))}
        </div>
        <div className="course-nine-grid">
          <ScorecardNine title="Front nine" holes={frontNine} teeKey={selectedTee} onSelectHole={setSelectedHoleNumber} selectedHole={selectedHoleNumber} />
          <ScorecardNine title="Back nine" holes={backNine} teeKey={selectedTee} onSelectHole={setSelectedHoleNumber} selectedHole={selectedHoleNumber} />
        </div>
      </section>

      {selectedHole && <section className="hole-guide-section" aria-labelledby="hole-guide-title">
        <div className="course-section-heading">
          <div><p className="eyebrow">{course.noteAvailability === 'hole-by-hole' ? 'Official hole guide' : 'Hole scorecard'}</p><h2 id="hole-guide-title">Hole {selectedHole.number}</h2></div>
          <span>Par {selectedHole.par} · SI {selectedHole.strokeIndex}</span>
        </div>
        <div className="hole-number-strip" role="tablist" aria-label="Choose a hole">
          {course.holes.map((hole) => <button type="button" role="tab" aria-selected={hole.number === selectedHole.number} className={hole.number === selectedHole.number ? 'active' : ''} onClick={() => setSelectedHoleNumber(hole.number)} key={hole.number}>{hole.number}</button>)}
        </div>
        <article className="card selected-hole-card">
          <div className="selected-hole-number">
            <span>{selectedHole.number}</span>
            <div><small>Par</small><strong>{selectedHole.par}</strong></div>
            <div><small>Stroke index</small><strong>{selectedHole.strokeIndex}</strong></div>
          </div>
          <div className="hole-yardage-grid">
            {course.tees.map((tee) => <span key={tee.key} style={{ '--tee-colour': tee.colour } as CSSProperties}><i aria-hidden="true" /><small>{tee.label}</small><strong>{selectedHole.yards[tee.key] ?? '—'}</strong><b>yds</b></span>)}
          </div>
          {selectedHole.officialNote ? <div className="official-hole-note"><p className="eyebrow">From the official course guide</p><p>{selectedHole.officialNote}</p></div> : <div className="official-hole-note unavailable"><p className="eyebrow">Official commentary</p><p>No official note is saved for this hole. The verified scorecard is shown without adding third-party or invented strategy.</p></div>}
          <div className="hole-guide-actions">
            <button type="button" disabled={selectedHole.number === 1} onClick={() => moveHole(-1)}>‹ Previous</button>
            <span>Hole {selectedHole.number} of {course.holes.length}</span>
            <button type="button" disabled={selectedHole.number === course.holes.length} onClick={() => moveHole(1)}>Next ›</button>
          </div>
        </article>
      </section>}
    </div>
  );
}

function ScorecardNine({ title, holes, teeKey, onSelectHole, selectedHole }: { title: string; holes: CourseGuide['holes']; teeKey: string; onSelectHole: (hole: number) => void; selectedHole: number }) {
  const par = holes.reduce((sum, hole) => sum + hole.par, 0);
  const yards = holes.reduce((sum, hole) => sum + (hole.yards[teeKey] ?? 0), 0);
  return (
    <article className="course-nine-card card">
      <div className="course-nine-heading"><h3>{title}</h3><span>Par {par} · {yards.toLocaleString('en-GB')} yds</span></div>
      <div className="course-scorecard-list">
        <div className="course-scorecard-labels"><span>Hole</span><span>Par</span><span>SI</span><span>Yards</span></div>
        {holes.map((hole) => (
          <button type="button" className={selectedHole === hole.number ? 'active' : ''} onClick={() => onSelectHole(hole.number)} key={hole.number}>
            <strong>{hole.number}</strong>
            <span>{hole.par}</span>
            <span>{hole.strokeIndex}</span>
            <b>{hole.yards[teeKey] ?? '—'}</b>
          </button>
        ))}
      </div>
    </article>
  );
}
