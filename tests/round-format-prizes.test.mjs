import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const matchplaySource = readFileSync(new URL('../src/lib/matchplay.ts', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('../src/lib/display.ts', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const publicSource = readFileSync(new URL('../src/pages/Matches.tsx', import.meta.url), 'utf8');
const resetSource = readFileSync(new URL('../netlify/functions/admin-reset-bet-punto-tour.ts', import.meta.url), 'utf8');

describe('round holes and matchplay options', () => {
  it('keeps 18-hole options and adds a 9-hole option helper', () => {
    assert.match(matchplaySource, /'10 & 8'/);
    assert.match(matchplaySource, /NINE_HOLE_MATCHPLAY_RESULT_OPTIONS[\s\S]*'5 & 4'/);
    assert.match(matchplaySource, /matchplayResultOptionsForHoles\(holes/);
  });

  it('9-hole validation rejects impossible 18-hole margins', () => {
    assert.match(matchplaySource, /isValidMatchplayResultForHoles/);
    assert.match(matchplaySource, /matchplayResultOptionsForHoles\(holes\)\.includes\(normalized\)/);
    assert.doesNotMatch(matchplaySource.match(/NINE_HOLE_MATCHPLAY_RESULT_OPTIONS[\s\S]*?\] as const/)?.[0] ?? '', /10 & 8/);
  });

  it('same-day round labels include session/course/format/holes context', () => {
    assert.match(displaySource, /formatRoundContextLabel/);
    assert.match(displaySource, /roundSession\(round\)/);
    assert.match(displaySource, /`\$\{round\?\.holes \?\? 18\} holes`/);
  });
});

describe('secondary prize result support', () => {
  it('adds admin CRUD and default prize helper without changing tabs', () => {
    assert.match(adminSource, /Secondary prize results/);
    assert.match(adminSource, /saveRoundPrizeResult/);
    assert.match(adminSource, /deleteRoundPrizeResult/);
    assert.match(adminSource, /createDefaultRoundPrizeResults/);
    assert.match(adminSource, /const tabs = \['Overview', 'Tour setup', 'Player library', 'Squads & teams', 'Rounds & tee times', 'Matches & pairings', 'Result entry'/);
  });

  it('public display hides via published API query and renders published rows', () => {
    assert.match(publicSource, /SecondaryPrizeRows/);
    assert.match(publicSource, /Secondary prize:/);
  });

  it('Bet Punto reset does not delete round prize results', () => {
    assert.doesNotMatch(resetSource, /round_prize_results/);
  });
});
