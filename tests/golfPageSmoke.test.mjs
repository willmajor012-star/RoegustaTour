import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const matchesSource = readFileSync('src/pages/Matches.tsx', 'utf8');

test('Golf Tee Times section stays tee-sheet only and always maps matches to tee rows', () => {
  const teeTimesStart = matchesSource.indexOf('function GolfTeeTimes');
  const resultsStart = matchesSource.indexOf('function GolfResults');
  assert.ok(teeTimesStart > -1, 'GolfTeeTimes function should exist');
  assert.ok(resultsStart > teeTimesStart, 'GolfResults should follow GolfTeeTimes');
  const teeTimesBlock = matchesSource.slice(teeTimesStart, resultsStart);
  assert.match(teeTimesBlock, /matches\.map\(\(match\) => <TeeSheetRow/);
  assert.doesNotMatch(teeTimesBlock, /<MatchCard/);
  assert.doesNotMatch(teeTimesBlock, /result-chip|winner|loser/);
});
