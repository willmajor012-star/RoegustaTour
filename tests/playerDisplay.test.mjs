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

const { tourDisplayPlayer } = loadTsModule('src/lib/playerDisplay.ts');

test('tour display player uses tour-specific profile values before global fallbacks', () => {
  const player = { id: 'p1', displayName: 'Player One', nickname: 'Global Nick', photoUrl: 'global.jpg', profileBio: 'Global bio', active: true, createdAt: 'now' };
  assert.deepEqual(tourDisplayPlayer(player, { nickname: 'Tour Nick', photoUrl: 'tour.jpg', profileBio: 'Tour bio' }), { ...player, nickname: 'Tour Nick', photoUrl: 'tour.jpg', profileBio: 'Tour bio' });
  assert.deepEqual(tourDisplayPlayer(player, {}), player);
});
