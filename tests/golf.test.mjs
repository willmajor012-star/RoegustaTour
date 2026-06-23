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

test('Golf points target uses every non-void tour match', () => {
  const base = { id: 'm', tourId: 't', roundId: 'r', matchNumber: 1, format: 'singles', sideATeamId: 'a', sideBTeamId: 'b', pointsAvailable: 1, status: 'planned' };
  assert.deepEqual(tourPointsTarget(Array.from({ length: 8 }, (_, index) => ({ ...base, id: `m${index}` }))), { totalAvailablePoints: 8, pointsToWin: 4.5 });
  assert.deepEqual(tourPointsTarget([
    { ...base, id: 'one', pointsAvailable: 2 },
    { ...base, id: 'two', pointsAvailable: 1, status: 'complete', winningSide: 'halved' },
    { ...base, id: 'void-status', status: 'void' },
    { ...base, id: 'void-winner', winningSide: 'void' },
  ]), { totalAvailablePoints: 3, pointsToWin: 1.5 });
});
