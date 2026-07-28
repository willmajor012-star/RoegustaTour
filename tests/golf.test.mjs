import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTsModule(path) {
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', js)(module.exports, () => ({}), module);
  return module.exports;
}

const { tourPointsTarget } = loadTsModule('src/lib/golf.ts');
const { projectedTourPoints } = loadTsModule('src/lib/matchplay.ts');

test('Golf points target uses every non-void tour match', () => {
  const base = { id: 'm', tourId: 't', roundId: 'r', matchNumber: 1, format: 'singles', sideATeamId: 'a', sideBTeamId: 'b', pointsAvailable: 1, status: 'planned' };
  assert.deepEqual(tourPointsTarget([{ ...base, id: 'single' }]), { totalAvailablePoints: 1, pointsToWin: 1 });
  assert.deepEqual(tourPointsTarget(Array.from({ length: 3 }, (_, index) => ({ ...base, id: `odd${index}` }))), { totalAvailablePoints: 3, pointsToWin: 2 });
  assert.deepEqual(tourPointsTarget(Array.from({ length: 4 }, (_, index) => ({ ...base, id: `even${index}` }))), { totalAvailablePoints: 4, pointsToWin: 2.5 });
  assert.deepEqual(tourPointsTarget(Array.from({ length: 24 }, (_, index) => ({ ...base, id: `full${index}` }))), { totalAvailablePoints: 24, pointsToWin: 12.5 });
  assert.deepEqual(tourPointsTarget([
    { ...base, id: 'one', pointsAvailable: 2 },
    { ...base, id: 'two', pointsAvailable: 1, status: 'complete', winningSide: 'halved' },
    { ...base, id: 'void-status', status: 'void' },
    { ...base, id: 'void-winner', winningSide: 'void' },
  ]), { totalAvailablePoints: 3, pointsToWin: 2 });
});

test('Home projects the full target from rounds and the two-team roster before pairings exist', () => {
  const teams = [
    { id: 'major', tourId: 'tour', name: 'Team Major', sortOrder: 0 },
    { id: 'verbeek', tourId: 'tour', name: 'Team Verbeek', sortOrder: 1 },
  ];
  const tourPlayers = Array.from({ length: 24 }, (_, index) => ({
    id: `tour-player-${index}`,
    tourId: 'tour',
    playerId: `player-${index}`,
    attending: true,
  }));
  const members = tourPlayers.map((player, index) => ({
    id: `member-${index}`,
    tourId: 'tour',
    teamId: index < 12 ? 'major' : 'verbeek',
    playerId: player.playerId,
  }));
  const rounds = [
    { id: 'par-3', tourId: 'tour', roundNumber: 1, name: 'Par 3', format: 'scramble', holes: 18, status: 'planned' },
    { id: 'faldo', tourId: 'tour', roundNumber: 2, name: 'Faldo', format: 'better_ball', holes: 18, status: 'planned' },
    { id: 'old', tourId: 'tour', roundNumber: 3, name: 'Old Course', format: 'singles', holes: 18, status: 'planned' },
    { id: 'oconnor', tourId: 'tour', roundNumber: 4, name: 'O’Connor', format: 'better_ball', holes: 9, status: 'planned' },
  ];

  assert.equal(projectedTourPoints(rounds, [], teams, members, tourPlayers), 30);
});

test('Home does not let a partial match sheet reduce a round projection', () => {
  const teams = [
    { id: 'a', tourId: 'tour', name: 'A', sortOrder: 0 },
    { id: 'b', tourId: 'tour', name: 'B', sortOrder: 1 },
  ];
  const tourPlayers = Array.from({ length: 8 }, (_, index) => ({ id: `tp-${index}`, tourId: 'tour', playerId: `p-${index}`, attending: true }));
  const members = tourPlayers.map((player, index) => ({ id: `tm-${index}`, tourId: 'tour', teamId: index < 4 ? 'a' : 'b', playerId: player.playerId }));
  const rounds = [{ id: 'round', tourId: 'tour', roundNumber: 1, name: 'Round', format: 'singles', holes: 18, status: 'planned' }];
  const matches = Array.from({ length: 3 }, (_, index) => ({
    id: `match-${index}`,
    tourId: 'tour',
    roundId: 'round',
    matchNumber: index + 1,
    format: 'singles',
    status: 'planned',
    sideATeamId: 'a',
    sideBTeamId: 'b',
    pointsAvailable: 1,
  }));

  assert.equal(projectedTourPoints(rounds, matches, teams, members, tourPlayers), 4);
});

test('Home can project from the private attending-player count without exposing the unassigned roster', () => {
  const teams = [
    { id: 'a', tourId: 'tour', name: 'A', sortOrder: 0 },
    { id: 'b', tourId: 'tour', name: 'B', sortOrder: 1 },
  ];
  const rounds = [
    { id: 'pairs', tourId: 'tour', roundNumber: 1, name: 'Pairs', format: 'better_ball', holes: 18, status: 'planned' },
    { id: 'singles', tourId: 'tour', roundNumber: 2, name: 'Singles', format: 'singles', holes: 18, status: 'planned' },
  ];

  assert.equal(projectedTourPoints(rounds, [], teams, [], [], 24), 18);
});
