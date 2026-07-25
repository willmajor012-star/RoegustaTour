import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const adminSource = await readFile(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const appShellSource = await readFile(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
const navSource = await readFile(new URL('../src/app/navigation.ts', import.meta.url), 'utf8');
const adminHeaderSource = await readFile(new URL('../src/components/AdminBrandHeader.tsx', import.meta.url), 'utf8');

test('Admin route keeps app navigation context without occupying a primary tab', () => {
  assert.match(appShellSource, /path === '\/admin'/);
  assert.match(appShellSource, /<AdminBrandHeader \/>/);
  assert.match(appShellSource, /<BottomNav currentPath=\{path\} onNavigate=\{navigate\} \/>/);
  assert.match(adminSource, /Back to app/);
  assert.match(adminSource, /End admin session/);
  assert.doesNotMatch(navSource, /label: 'Admin'|path: '\/admin'|moreNavigationItems/);
});

test('SPA link handling preserves same-page admin guide hash jumps', () => {
  assert.match(appShellSource, /url\.pathname === window\.location\.pathname && url\.search === window\.location\.search && url\.hash\) return/);
});

test('Admin header is static and does not require public password data', () => {
  assert.match(adminHeaderSource, /Admin mode/);
  assert.match(adminHeaderSource, /Roegusta Tour/);
  assert.match(adminHeaderSource, /Public password access remains separate/);
  assert.doesNotMatch(adminHeaderSource, /fetchPublicSummary|usePublicData|publicApi/);
  assert.doesNotMatch(appShellSource.slice(appShellSource.indexOf("path === '/admin'"), appShellSource.indexOf('return (', appShellSource.indexOf("path === '/admin'"))), /PublicPasswordGate|<BrandHeader/);
});

test('Admin operating manual includes required workflow headings and separation guidance', () => {
  for (const heading of ['Admin access', 'Public password access', 'Creating or selecting a tour', '2026 format setup', 'Rounds', 'Teams and rosters', 'Player profiles and photos', 'Pairings and tee times', 'Match results', 'Secondary prize results', 'Bet Punto', 'Info page / handbook / itinerary', 'Publishing and visibility', 'Archiving and next year setup', 'Troubleshooting centre']) {
    assert.match(adminSource, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(adminSource, /public password is not the Admin PIN/i);
  assert.match(adminSource, /Admin PIN and never unlocks Admin/i);
});

test('Admin guide documents manual and unsupported boundaries accurately', () => {
  for (const expected of ['manual admin bet', 'Secondary prize results', 'player-photos', 'Direct upload is not currently built', 'no wallet', 'no payment handling', 'no actual money transfer', 'does not create Friday golf', '10 & 8 is not a valid 9-hole result']) {
    assert.match(adminSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(adminSource, /Team 1 \/ Team 2|Team 1|Team 2/);
});
