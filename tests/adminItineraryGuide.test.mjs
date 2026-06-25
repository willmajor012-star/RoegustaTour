import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';


const roundItinerarySourceToken = (roundId) => `[round:${roundId}]`;
const normalizeOrder = (items) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || (a.itemDate ?? '').localeCompare(b.itemDate ?? '') || a.activity.localeCompare(b.activity) || a.id.localeCompare(b.id)).map((item, index) => ({ ...item, sortOrder: index + 1 }));
const reorderItineraryItems = (items, itemId, direction) => {
  const ordered = normalizeOrder(items);
  const index = ordered.findIndex((candidate) => candidate.id === itemId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const moved = [...ordered];
  [moved[index], moved[targetIndex]] = [moved[targetIndex], moved[index]];
  return moved.map((candidate, nextIndex) => ({ ...candidate, sortOrder: nextIndex + 1 }));
};
const buildMissingRoundItineraryDrafts = (existingItems, rounds) => {
  const ordered = normalizeOrder(existingItems);
  return rounds.filter((candidate) => candidate.roundDate).filter((candidate) => !ordered.some((existing) => existing.notes?.includes(roundItinerarySourceToken(candidate.id)) || (existing.itemDate === candidate.roundDate && existing.activity.trim().toLowerCase() === (candidate.name || `Round ${candidate.roundNumber}`).trim().toLowerCase()))).map((candidate, index) => ({ itemDate: candidate.roundDate, dayLabel: null, timeLabel: candidate.teeTime || 'TBC', activity: candidate.name || `Round ${candidate.roundNumber}`, location: candidate.courseName || 'Course TBC', notes: [roundItinerarySourceToken(candidate.id), candidate.formatLabel].filter(Boolean).join(' '), isPlaceholder: !candidate.teeTime || !candidate.courseName, sortOrder: ordered.length + index + 1 }));
};

const item = (id, sortOrder, overrides = {}) => ({
  id,
  tourId: 'tour-1',
  itemDate: '2026-11-07',
  dayLabel: 'Saturday',
  timeLabel: 'TBC',
  activity: `Activity ${id}`,
  location: 'Course',
  notes: '',
  isPlaceholder: false,
  sortOrder,
  ...overrides,
});

const round = (overrides = {}) => ({
  id: 'round-1',
  tourId: 'tour-1',
  roundNumber: 1,
  name: 'Round 1',
  roundDate: '2026-11-07',
  courseName: 'Course A',
  teeTime: 'TBC',
  formatLabel: 'Singles',
  notes: '',
  status: 'planned',
  published: false,
  ...overrides,
});

test('Admin guide tab and itinerary editor are present with key workflow topics', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
  for (const topic of ['Admin guide', 'Build draft itinerary from tour dates and rounds', 'tour_itinerary_items', 'Do not assume Friday golf', 'player-photos', 'Current public tour', 'planned, active, complete or archived', 'Tee Times, Results, Teams', 'manual admin bet entry', 'Reset Bet Punto']) {
    assert.match(admin, new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('Admin itinerary CRUD functions use tour_itinerary_items', async () => {
  const saveFn = await readFile(new URL('../netlify/functions/admin-save-itinerary-item.ts', import.meta.url), 'utf8');
  const deleteFn = await readFile(new URL('../netlify/functions/admin-delete-itinerary-item.ts', import.meta.url), 'utf8');
  assert.match(saveFn, /tour_itinerary_items/);
  assert.match(saveFn, /is_placeholder/);
  assert.match(deleteFn, /tour_itinerary_items/);
});

test('itinerary move up and down swaps neighbours and produces unique order values', () => {
  const items = [item('a', 1), item('b', 2), item('c', 3)];
  assert.deepEqual(reorderItineraryItems(items, 'b', -1).map(({ id, sortOrder }) => [id, sortOrder]), [['b', 1], ['a', 2], ['c', 3]]);
  assert.deepEqual(reorderItineraryItems(items, 'b', 1).map(({ id, sortOrder }) => [id, sortOrder]), [['a', 1], ['c', 2], ['b', 3]]);
});

test('itinerary builder does not duplicate generated round items after time label edit', () => {
  const sourceRound = round();
  const firstDraft = buildMissingRoundItineraryDrafts([], [sourceRound]);
  assert.equal(firstDraft.length, 1);
  const existing = item('generated', 1, { activity: 'Round 1', timeLabel: '09:32', notes: `${roundItinerarySourceToken(sourceRound.id)} Singles` });
  assert.deepEqual(buildMissingRoundItineraryDrafts([existing], [{ ...sourceRound, teeTime: '10:00' }]), []);
});

test('itinerary builder does not duplicate generated round items after round tee time change when legacy item lacks token', () => {
  const sourceRound = round({ teeTime: 'TBC' });
  const existing = item('legacy-generated', 1, { activity: 'Round 1', timeLabel: '09:32', notes: 'Singles' });
  assert.deepEqual(buildMissingRoundItineraryDrafts([existing], [{ ...sourceRound, teeTime: '10:00' }]), []);
});

test('Public Info itinerary empty state is explicit TBC', async () => {
  const info = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  assert.match(info, /Itinerary TBC\./);
  assert.doesNotMatch(info, /Friday placeholder round/i);
});

test('Bet Punto CSS stacks tables on mobile instead of requiring horizontal scrolling', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.betting-page \.bet-summary-table thead\s*{\s*display: none;/);
  assert.match(css, /\.betting-page \.bet-summary-table td\s*{[^}]*grid-template-columns/s);
  assert.match(css, /overflow-wrap: anywhere/);
});
