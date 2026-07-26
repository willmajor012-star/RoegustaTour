import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const navigationSource = readFileSync('src/app/navigation.ts', 'utf8');
const routesSource = readFileSync('src/app/routes.tsx', 'utf8');
const bottomNavSource = readFileSync('src/components/BottomNav.tsx', 'utf8');
const dashboardSource = readFileSync('src/pages/Dashboard.tsx', 'utf8');
const golfSource = readFileSync('src/pages/Matches.tsx', 'utf8');
const teamsSource = readFileSync('src/pages/Teams.tsx', 'utf8');
const usabilityCss = readFileSync('src/styles/usability.css', 'utf8');
const experienceCss = readFileSync('src/styles/experience.css', 'utf8');

test('primary mobile navigation exposes the five on-tour destinations without a More drawer', () => {
  const primaryBlock = navigationSource.slice(navigationSource.indexOf('export const navigationItems'));
  assert.equal((primaryBlock.match(/\{ path:/g) ?? []).length, 5);
  for (const label of ['Home', 'Golf', 'Tours', 'Stats', 'Bet Punto']) assert.match(primaryBlock, new RegExp(`label: '${label}'`));
  for (const label of ['Score', 'More', 'Admin']) assert.doesNotMatch(primaryBlock, new RegExp(`label: '${label}'`));
  assert.doesNotMatch(bottomNavSource, /more-menu-sheet|aria-modal="true"|moreNavigationItems/);
  assert.match(bottomNavSource, /currentPath === '\/teams'[\s\S]*currentPath === '\/info'[\s\S]*currentPath === '\/courses'/);
});

test('the old Players route is removed and canonicalised to Teams & Players', () => {
  assert.doesNotMatch(routesSource, /path: '\/players'|from '\.\.\/pages\/Players'/);
  assert.match(readFileSync('src/app/AppShell.tsx', 'utf8'), /window\.location\.pathname === '\/players'[\s\S]*'\/teams'/);
});

test('home follows the score, target, on-course, courses, results and tour hierarchy', () => {
  assert.match(dashboardSource, /home-up-next/);
  assert.match(dashboardSource, /<CourseRail/);
  assert.match(dashboardSource, /href="\/tours"/);
  assert.match(dashboardSource, /Teams, players, course guides and itinerary/);
  assert.match(dashboardSource, /tourLive/);
  assert.match(dashboardSource, /tourComplete/);

  const score = dashboardSource.indexOf('score-feature card');
  const target = dashboardSource.indexOf('overview-highlight-grid');
  const onCourse = dashboardSource.indexOf('home-up-next');
  const courses = dashboardSource.indexOf('<CourseRail');
  const results = dashboardSource.indexOf('{latestResultCard}');
  const thisTour = dashboardSource.indexOf('home-this-tour-card');
  assert.ok(score < target && target < onCourse && onCourse < courses && courses < results && results < thisTour);
});

test('Golf is round-led and separates tee sheet, results and prizes', () => {
  assert.match(golfSource, /round-card-strip/);
  assert.doesNotMatch(golfSource, /golf-round-selector|<select value=\{selectedRound/);
  for (const section of ['tee-sheet', 'results', 'prizes']) assert.match(golfSource, new RegExp(`value: '${section}'`));
  assert.match(golfSource, /selected-round-facts/);
});

test('Teams & Players opens a focused player profile and links to detailed stats', () => {
  assert.match(teamsSource, /title="Teams & players"/);
  assert.match(teamsSource, /PlayerProfileDrawer/);
  assert.match(teamsSource, /role="dialog"/);
  assert.match(teamsSource, /href="\/stats"/);
});

test('new interactive surfaces meet mobile touch-target and fixed-nav spacing requirements', () => {
  assert.match(usabilityCss, /min-height: 44px/);
  assert.match(experienceCss, /\.bottom-nav\s*\{[\s\S]*grid-template-columns: repeat\(5/);
  assert.match(usabilityCss, /\.app-shell[\s\S]*padding-bottom: 104px/);
  assert.match(experienceCss, /@media \(max-width: 460px\)/);
});
