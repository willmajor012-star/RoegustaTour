import { useEffect, useMemo, useState } from 'react';
import { courseGuides } from '../data/courseGuides';
import { deleteCourse, saveCourse, type AdminDataResponse } from '../lib/adminApi';
import type { CourseGuide, CourseHole, CourseTee, Tour } from '../lib/types';

type EditorState = {
  saving: boolean;
  message?: string;
  error?: string;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function emptyCourse(tourId: string, sortOrder = 0): CourseGuide {
  const tees: CourseTee[] = [
    { key: 'white', label: 'White', colour: '#f7f3e9', textColour: '#102f24' },
    { key: 'yellow', label: 'Yellow', colour: '#f0cb3c', textColour: '#102f24' },
    { key: 'red', label: 'Red', colour: '#ae3c45', textColour: '#ffffff' },
  ];
  return {
    tourId,
    slug: '',
    name: '',
    shortName: '',
    resort: '',
    location: '',
    architect: '',
    opened: '',
    overview: '',
    noteAvailability: 'course-only',
    officialPageUrl: '',
    scorecardUrl: '',
    heroImageUrl: '',
    heroPosition: 'center',
    tees,
    holes: [],
    sortOrder,
    published: false,
    showOnHome: false,
  };
}

function copyCourse(course: CourseGuide, tourId: string, sortOrder: number): CourseGuide {
  return {
    ...structuredClone(course),
    id: undefined,
    tourId,
    sortOrder,
    published: false,
    showOnHome: false,
  };
}

function newHole(number: number, tees: CourseTee[]): CourseHole {
  return {
    number,
    par: 4,
    strokeIndex: number,
    yards: Object.fromEntries(tees.map((tee) => [tee.key, 0])),
  };
}

function completeHoleRows(course: CourseGuide, count: number): CourseGuide {
  const holes = Array.from({ length: count }, (_, index) => course.holes[index] ?? newHole(index + 1, course.tees))
    .map((hole, index) => ({ ...hole, number: index + 1, yards: Object.fromEntries(course.tees.map((tee) => [tee.key, hole.yards[tee.key] ?? 0])) }));
  return { ...course, holes };
}

export function AdminCourseEditor({ data, tour, onRefresh }: { data: AdminDataResponse; tour: Tour; onRefresh: () => Promise<void> | void }) {
  const orderedCourses = useMemo(() => [...data.tourCourses].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [data.tourCourses]);
  const reusableCourses = useMemo(() => {
    const all = [...courseGuides, ...data.courseLibrary.filter((course) => course.tourId !== tour.id)];
    const seen = new Set<string>();
    return all.filter((course) => {
      const key = `${course.name.toLowerCase()}|${course.holes.length}|${course.tees.map((tee) => tee.key).join(',')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data.courseLibrary, tour.id]);
  const [draft, setDraft] = useState<CourseGuide>(() => orderedCourses[0] ?? emptyCourse(tour.id));
  const [state, setState] = useState<EditorState>({ saving: false });

  useEffect(() => {
    const matching = draft.id ? orderedCourses.find((course) => course.id === draft.id) : undefined;
    if (matching) setDraft(matching);
    else setDraft(orderedCourses[0] ?? emptyCourse(tour.id));
    setState({ saving: false });
    // Reload only when the selected tour changes or refreshed course identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id, orderedCourses.map((course) => course.id).join('|')]);

  const updateTee = (index: number, patch: Partial<CourseTee>) => setDraft((current) => {
    const previousKey = current.tees[index]?.key;
    const tees = current.tees.map((tee, teeIndex) => teeIndex === index ? { ...tee, ...patch } : tee);
    const nextKey = tees[index]?.key;
    const holes = previousKey && nextKey && previousKey !== nextKey
      ? current.holes.map((hole) => {
        const yards = { ...hole.yards, [nextKey]: hole.yards[previousKey] ?? 0 };
        delete yards[previousKey];
        return { ...hole, yards };
      })
      : current.holes;
    return { ...current, tees, holes };
  });

  const addTee = () => setDraft((current) => {
    if (current.tees.length >= 8) return current;
    const key = `tee-${current.tees.length + 1}`;
    return {
      ...current,
      tees: [...current.tees, { key, label: `Tee ${current.tees.length + 1}`, colour: '#0f2f24', textColour: '#ffffff' }],
      holes: current.holes.map((hole) => ({ ...hole, yards: { ...hole.yards, [key]: 0 } })),
    };
  });

  const removeTee = (index: number) => setDraft((current) => {
    if (current.tees.length <= 1) return current;
    const removedKey = current.tees[index].key;
    return {
      ...current,
      tees: current.tees.filter((_, teeIndex) => teeIndex !== index),
      holes: current.holes.map((hole) => {
        const yards = { ...hole.yards };
        delete yards[removedKey];
        return { ...hole, yards };
      }),
    };
  });

  const updateHole = (index: number, patch: Partial<CourseHole>) => setDraft((current) => ({
    ...current,
    holes: current.holes.map((hole, holeIndex) => holeIndex === index ? { ...hole, ...patch } : hole),
  }));

  const updateYardage = (holeIndex: number, teeKey: string, value: string) => setDraft((current) => ({
    ...current,
    holes: current.holes.map((hole, index) => index === holeIndex ? { ...hole, yards: { ...hole.yards, [teeKey]: Number(value) || 0 } } : hole),
  }));

  const submit = async () => {
    setState({ saving: true, message: 'Saving course guide…' });
    try {
      const response = await saveCourse({
        ...draft,
        tourId: tour.id,
        slug: draft.slug || slugify(draft.shortName || draft.name),
        sortOrder: draft.sortOrder ?? orderedCourses.length,
        published: draft.published ?? false,
      });
      await onRefresh();
      setDraft(response.course);
      setState({ saving: false, message: 'Course guide saved.' });
    } catch (error) {
      setState({ saving: false, error: error instanceof Error ? error.message : 'Course guide could not be saved.' });
    }
  };

  const remove = async () => {
    if (!draft.id || !window.confirm(`Delete ${draft.name || 'this course guide'}?`)) return;
    setState({ saving: true, message: 'Deleting course guide…' });
    try {
      await deleteCourse({ id: draft.id, tourId: tour.id });
      await onRefresh();
      setDraft(emptyCourse(tour.id, Math.max(0, orderedCourses.length - 1)));
      setState({ saving: false, message: 'Course guide deleted.' });
    } catch (error) {
      setState({ saving: false, error: error instanceof Error ? error.message : 'Course guide could not be deleted.' });
    }
  };

  return <section className="admin-course-editor">
    <div className="card course-admin-heading">
      <div><p className="eyebrow">Tour course library</p><h3>Course guides & scorecards</h3><p>Every public guide must first be saved to this tour. Start from a library template or a previous-tour guide, check it, save it, then link it to the relevant round. A round such as the Par 3 can deliberately have no guide.</p></div>
      <div className="course-admin-pickers">
        <label>Edit course
          <select value={draft.id ?? ''} onChange={(event) => setDraft(orderedCourses.find((course) => course.id === event.target.value) ?? emptyCourse(tour.id, orderedCourses.length))}>
            <option value="">New course</option>
            {orderedCourses.map((course) => <option value={course.id} key={course.id}>{course.name}{course.published ? ' · public' : ' · private'}</option>)}
          </select>
        </label>
        <label>Add from course library
          <select value="" onChange={(event) => {
            const source = reusableCourses.find((course, index) => `${course.id ?? 'built-in'}:${index}` === event.target.value);
            if (source) setDraft(copyCourse(source, tour.id, orderedCourses.length));
          }}>
            <option value="">Choose a template or previous guide</option>
            {reusableCourses.map((course, index) => <option value={`${course.id ?? 'built-in'}:${index}`} key={`${course.id ?? 'built-in'}:${index}`}>{course.name} · {course.holes.length} holes</option>)}
          </select>
          <small>This loads a copy into the form. Review it and press Save course guide to add it to this tour.</small>
        </label>
        <button type="button" onClick={() => setDraft(emptyCourse(tour.id, orderedCourses.length))}>New blank course</button>
      </div>
    </div>

    <div className="card admin-course-section">
      <div className="section-heading"><div><p className="eyebrow">1 · Course identity</p><h3>Overview & official sources</h3></div></div>
      <div className="admin-form-grid">
        <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: draft.slug || slugify(event.target.value) })} /></label>
        <label>Short name<input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} /></label>
        <label>URL slug<input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: slugify(event.target.value) })} /></label>
        <label>Resort / club<input value={draft.resort} onChange={(event) => setDraft({ ...draft, resort: event.target.value })} /></label>
        <label>Location<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
        <label>Architect<input value={draft.architect} onChange={(event) => setDraft({ ...draft, architect: event.target.value })} /></label>
        <label>Opened<input value={draft.opened ?? ''} onChange={(event) => setDraft({ ...draft, opened: event.target.value })} /></label>
        <label>Hero image URL<input value={draft.heroImageUrl ?? ''} onChange={(event) => setDraft({ ...draft, heroImageUrl: event.target.value })} /></label>
        <label>Official course page<input value={draft.officialPageUrl ?? ''} onChange={(event) => setDraft({ ...draft, officialPageUrl: event.target.value })} /></label>
        <label>Official scorecard URL<input value={draft.scorecardUrl ?? ''} onChange={(event) => setDraft({ ...draft, scorecardUrl: event.target.value })} /></label>
        <label>Hole commentary<select value={draft.noteAvailability} onChange={(event) => setDraft({ ...draft, noteAvailability: event.target.value as CourseGuide['noteAvailability'] })}><option value="course-only">Course overview only</option><option value="hole-by-hole">Official hole-by-hole notes</option></select></label>
        <label>Sort order<input inputMode="numeric" value={draft.sortOrder ?? 0} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })} /></label>
        <label className="admin-full-span">Official overview<textarea value={draft.overview} onChange={(event) => setDraft({ ...draft, overview: event.target.value })} /></label>
        <label className="publish-toggle admin-full-span"><input type="checkbox" checked={draft.published ?? false} onChange={(event) => setDraft({ ...draft, published: event.target.checked })} /> Publish this course with the selected tour</label>
        <label className="publish-toggle admin-full-span"><input type="checkbox" checked={draft.showOnHome ?? false} onChange={(event) => setDraft({ ...draft, showOnHome: event.target.checked })} /> Show this guide in the Home course section</label>
        <small className="admin-full-span">A guide must be published before it can appear publicly. Home visibility is separate so Admin can publish a guide for Golf/Courses without featuring it on Home.</small>
      </div>
    </div>

    <div className="card admin-course-section">
      <div className="section-heading"><div><p className="eyebrow">2 · Tees</p><h3>Scorecard tees</h3></div><button className="pill" type="button" onClick={addTee}>Add tee</button></div>
      <div className="course-tee-admin-list">{draft.tees.map((tee, index) => <div key={`${tee.key}:${index}`}>
        <label>Key<input value={tee.key} onChange={(event) => updateTee(index, { key: slugify(event.target.value) })} /></label>
        <label>Label<input value={tee.label} onChange={(event) => updateTee(index, { label: event.target.value })} /></label>
        <label>Colour<input type="color" value={tee.colour} onChange={(event) => updateTee(index, { colour: event.target.value })} /></label>
        <button type="button" disabled={draft.tees.length <= 1} onClick={() => removeTee(index)}>Remove</button>
      </div>)}</div>
    </div>

    <div className="card admin-course-section">
      <div className="section-heading"><div><p className="eyebrow">3 · Scorecard</p><h3>Hole data in yards</h3></div><div className="chip-list"><button className="pill" type="button" onClick={() => setDraft((current) => completeHoleRows(current, 9))}>9 holes</button><button className="pill" type="button" onClick={() => setDraft((current) => completeHoleRows(current, 18))}>18 holes</button></div></div>
      {draft.holes.length === 0 ? <p>Choose 9 or 18 holes to create the scorecard rows, then enter the official figures.</p> : <div className="course-hole-admin-wrap"><table className="course-hole-admin-table"><thead><tr><th>Hole</th><th>Par</th><th>SI</th>{draft.tees.map((tee) => <th key={tee.key}>{tee.label}</th>)}<th>Official note</th></tr></thead><tbody>{draft.holes.map((hole, index) => <tr key={hole.number}>
        <td><strong>{hole.number}</strong></td>
        <td><input aria-label={`Hole ${hole.number} par`} inputMode="numeric" value={hole.par || ''} onChange={(event) => updateHole(index, { par: Number(event.target.value) || 0 })} /></td>
        <td><input aria-label={`Hole ${hole.number} stroke index`} inputMode="numeric" value={hole.strokeIndex || ''} onChange={(event) => updateHole(index, { strokeIndex: Number(event.target.value) || 0 })} /></td>
        {draft.tees.map((tee) => <td key={tee.key}><input aria-label={`Hole ${hole.number} ${tee.label} yards`} inputMode="numeric" value={hole.yards[tee.key] || ''} onChange={(event) => updateYardage(index, tee.key, event.target.value)} /></td>)}
        <td><textarea aria-label={`Hole ${hole.number} official note`} value={hole.officialNote ?? ''} onChange={(event) => updateHole(index, { officialNote: event.target.value })} /></td>
      </tr>)}</tbody></table></div>}
    </div>

    <div className="card course-admin-actions">
      <div><strong>{draft.id ? `Editing ${draft.name}` : 'New course guide'}</strong><small>Publishing makes the saved guide available to this tour. “Show on Home” controls only the Home course rail.</small></div>
      {draft.id && <button type="button" disabled={state.saving} onClick={() => void remove()}>Delete safe course</button>}
      <button type="button" disabled={state.saving} onClick={() => void submit()}>{state.saving ? 'Saving…' : 'Save course guide'}</button>
      {state.message && <p className="form-success">{state.message}</p>}
      {state.error && <p className="form-error">{state.error}</p>}
    </div>
  </section>;
}
