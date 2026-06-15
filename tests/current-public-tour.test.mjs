import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const statusRank = { active: 0, planned: 1, complete: 2, archived: 3 };
const newestFirst = (a, b) => b.year - a.year || Date.parse(b.startDate ?? '') - Date.parse(a.startDate ?? '') || a.name.localeCompare(b.name);
function selectDefaultTour(tours) {
  const explicitTour = tours.filter((tour) => tour.isCurrentPublic === true).sort(newestFirst)[0];
  if (explicitTour) return explicitTour;
  const activeOrUpcomingTour = tours.filter((tour) => tour.status === 'active' || tour.status === 'planned').sort((a, b) => statusRank[a.status] - statusRank[b.status] || newestFirst(a, b))[0];
  if (activeOrUpcomingTour) return activeOrUpcomingTour;
  return tours.filter((tour) => tour.status === 'complete' || tour.status === 'archived').sort((a, b) => statusRank[a.status] - statusRank[b.status] || newestFirst(a, b))[0];
}

function isMissingCurrentPublicColumn(error) {
  return /is_current_public|schema cache|column/i.test(error?.message ?? '');
}

function isPublicTour(tour) {
  if (!tour) return false;
  return tour.isCurrentPublic === true || tour.status === 'complete' || tour.status === 'archived';
}

function includedAdvancedStatTourIds(tours) {
  const currentTour = selectDefaultTour(tours);
  return tours.filter((tour) => isPublicTour(tour) || tour.id === currentTour?.id).map((tour) => tour.id);
}

function setCurrentPublicFlow(tours, selectedId, options = {}) {
  const warnings = [];
  let missingMigration = false;
  const setFailed = options.setFails;
  const unsetFailed = options.unsetFails;

  if (unsetFailed) {
    warnings.push(`unset current public tours: ${unsetFailed.message}`);
    missingMigration ||= isMissingCurrentPublicColumn(unsetFailed);
  } else {
    for (const tour of tours) if (tour.id !== selectedId) tour.isCurrentPublic = false;
  }

  if (setFailed) {
    missingMigration ||= isMissingCurrentPublicColumn(setFailed);
    return { ok: false, missingMigration, warnings };
  }

  const selected = tours.find((tour) => tour.id === selectedId);
  selected.isCurrentPublic = true;
  return { ok: true, tour: selected, warnings, missingMigration };
}

describe('public current tour resolution', () => {
  it('uses the explicit current public tour when one exists', () => {
    const selected = selectDefaultTour([
      { id: '2026', name: '2026', year: 2026, status: 'planned', isCurrentPublic: true },
      { id: '2025', name: '2025', year: 2025, status: 'complete' },
    ]);
    assert.equal(selected.id, '2026');
  });

  it('uses an upcoming or active tour when no current public flag exists', () => {
    const selected = selectDefaultTour([
      { id: '2025', name: '2025', year: 2025, status: 'complete' },
      { id: '2026', name: '2026', year: 2026, status: 'planned' },
    ]);
    assert.equal(selected.id, '2026');
  });

  it('uses the latest completed tour only as historical fallback', () => {
    const selected = selectDefaultTour([
      { id: '2024', name: '2024', year: 2024, status: 'complete' },
      { id: '2025', name: '2025', year: 2025, status: 'complete' },
    ]);
    assert.equal(selected.id, '2025');
  });

  it('keeps non-current planned tours out of public advanced stats', () => {
    const included = includedAdvancedStatTourIds([
      { id: 'current', name: 'Current', year: 2026, status: 'active' },
      { id: 'draft-next', name: 'Draft next', year: 2027, status: 'planned' },
      { id: 'history', name: 'History', year: 2025, status: 'complete' },
    ]);
    assert.deepEqual(included.sort(), ['current', 'history']);
  });

  it('detects the missing is_current_public schema cache case', () => {
    assert.equal(isMissingCurrentPublicColumn({ message: "Could not find the 'is_current_public' column of 'tours' in the schema cache" }), true);
    assert.equal(isMissingCurrentPublicColumn({ message: 'network timeout' }), false);
  });

  it('sets selected current public and unsets all other current public tours', () => {
    const tours = [
      { id: '2025', name: '2025', year: 2025, status: 'complete', isCurrentPublic: true },
      { id: '2026', name: '2026', year: 2026, status: 'planned', isCurrentPublic: false },
    ];
    const result = setCurrentPublicFlow(tours, '2026');
    assert.equal(result.ok, true);
    assert.equal(tours.find((tour) => tour.id === '2026').isCurrentPublic, true);
    assert.equal(tours.find((tour) => tour.id === '2025').isCurrentPublic, false);
  });
});
