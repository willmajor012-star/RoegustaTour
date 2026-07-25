import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const matchplaySource = readFileSync(new URL('../src/lib/matchplay.ts', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('../src/lib/display.ts', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const publicSource = readFileSync(new URL('../src/pages/Matches.tsx', import.meta.url), 'utf8');
const resetSource = readFileSync(new URL('../netlify/functions/admin-reset-bet-punto-tour.ts', import.meta.url), 'utf8');
const savePrizeSource = readFileSync(new URL('../netlify/functions/admin-save-round-prize-result.ts', import.meta.url), 'utf8');
const tourInfoSource = readFileSync(new URL('../src/pages/TourInfo.tsx', import.meta.url), 'utf8');

function pointsRequiredToWinOutright(totalAvailable) {
  return totalAvailable > 0 ? Math.floor(totalAvailable + 1) / 2 : undefined;
}

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

describe('points to win target', () => {
  it('requires strictly more than half for odd and even totals', () => {
    assert.equal(pointsRequiredToWinOutright(1), 1);
    assert.equal(pointsRequiredToWinOutright(3), 2);
    assert.equal(pointsRequiredToWinOutright(4), 2.5);
    assert.equal(pointsRequiredToWinOutright(5), 3);
    assert.equal(pointsRequiredToWinOutright(24), 12.5);
  });

  it('uses the same strictly-greater-than-half formula in matchplay and golf helpers', () => {
    const matchplaySource = readFileSync(new URL('../src/lib/matchplay.ts', import.meta.url), 'utf8');
    const golfSource = readFileSync(new URL('../src/lib/golf.ts', import.meta.url), 'utf8');
    assert.match(matchplaySource, /Math\.floor\(totalAvailable \+ 1\) \/ 2/);
    assert.match(golfSource, /Math\.floor\(totalAvailablePoints \+ 1\) \/ 2/);
  });
});

describe('secondary prize result support', () => {
  it('adds admin CRUD, a course library and the default prize helper', () => {
    assert.match(adminSource, /Secondary prize results/);
    assert.match(adminSource, /saveRoundPrizeResult/);
    assert.match(adminSource, /deleteRoundPrizeResult/);
    assert.match(adminSource, /createDefaultRoundPrizeResults/);
    assert.match(adminSource, /const tabs = \['Overview', 'Tour setup', 'Player library', 'Squads & teams', 'Courses', 'Rounds & tee times', 'Matches & pairings', 'Result entry'/);
  });

  it('public display hides via published API query and renders published rows', () => {
    assert.match(publicSource, /function GolfPrizes/);
    assert.match(publicSource, /selectedPrizes/);
    assert.match(publicSource, /section === 'prizes'/);
    assert.match(publicSource, /Secondary prizes/);
  });

  it('Tour Info secondary prize rows include winner plus score fallbacks', () => {
    assert.match(tourInfoSource, /Winner TBC/);
    assert.match(tourInfoSource, /scoreValue/);
    assert.match(tourInfoSource, /winnerPlayerId/);
    assert.match(tourInfoSource, /winnerTeamId/);
  });

  it('backend validates secondary prize linked IDs', () => {
    assert.match(savePrizeSource, /Winner team must belong to this tour/);
    assert.match(savePrizeSource, /Linked Bet Punto market must belong to this tour/);
    assert.match(savePrizeSource, /Winner player must exist/);
    assert.match(savePrizeSource, /Winner player must be attending this tour/);
  });

  it('Bet Punto reset does not delete round prize results', () => {
    assert.doesNotMatch(resetSource, /round_prize_results/);
  });
});
