import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Admin guide tab and itinerary editor are present', async () => {
  const admin = await readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
  assert.match(admin, /'Admin guide'/);
  assert.match(admin, /Build draft itinerary from tour dates and rounds/);
  assert.match(admin, /tour_itinerary_items/);
  assert.match(admin, /Do not assume Friday golf/);
});

test('Admin itinerary CRUD functions use tour_itinerary_items', async () => {
  const saveFn = await readFile(new URL('../netlify/functions/admin-save-itinerary-item.ts', import.meta.url), 'utf8');
  const deleteFn = await readFile(new URL('../netlify/functions/admin-delete-itinerary-item.ts', import.meta.url), 'utf8');
  assert.match(saveFn, /tour_itinerary_items/);
  assert.match(saveFn, /is_placeholder/);
  assert.match(deleteFn, /tour_itinerary_items/);
});

test('Public Info itinerary empty state is explicit TBC', async () => {
  const info = await readFile(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');
  assert.match(info, /Itinerary TBC\./);
  assert.doesNotMatch(info, /Friday placeholder round/i);
});
