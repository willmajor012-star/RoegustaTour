import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const courseData = readFileSync('src/data/courseGuides.ts', 'utf8');
const coursePage = readFileSync('src/pages/CourseGuidePage.tsx', 'utf8');
const coursesPage = readFileSync('src/pages/Courses.tsx', 'utf8');
const routes = readFileSync('src/app/routes.tsx', 'utf8');
const golfPage = readFileSync('src/pages/Matches.tsx', 'utf8');
const toursPage = readFileSync('src/pages/Tours.tsx', 'utf8');
const bettingPage = readFileSync('src/pages/Betting.tsx', 'utf8');
const bettingCard = readFileSync('src/components/BetMarketCard.tsx', 'utf8');
const adminPage = readFileSync('src/pages/Admin.tsx', 'utf8');
const liveDesk = readFileSync('src/components/AdminLiveDesk.tsx', 'utf8');
const refreshButton = readFileSync('src/components/RefreshButton.tsx', 'utf8');
const experienceCss = readFileSync('src/styles/experience.css', 'utf8');

test('course library contains only Faldo, O’Connor and Old Course with 18 verified scorecard rows each', () => {
  for (const slug of ['faldo', 'oconnor', 'old-course']) {
    assert.match(courseData, new RegExp(`slug: '${slug}'`));
    assert.match(routes, new RegExp(`path: '/courses/${slug}'`));
  }
  assert.doesNotMatch(courseData, /Academy|Par 3 course/i);
  assert.equal((courseData.slice(courseData.indexOf('const faldoHoles'), courseData.indexOf('const oconnorHoles')).match(/\{ number:/g) ?? []).length, 18);
  assert.equal((courseData.slice(courseData.indexOf('const oconnorHoles'), courseData.indexOf('const oldCourseHoles')).match(/\{ number:/g) ?? []).length, 18);
  assert.equal((courseData.slice(courseData.indexOf('const oldCourseHoles'), courseData.indexOf('export const courseGuides')).match(/\{ number:/g) ?? []).length, 18);
  assert.match(courseData, /Math\.round\(metres \* 1\.0936133\)/);
});

test('course guides show yards and preserve the official-commentary boundary', () => {
  assert.match(coursePage, /All distances in yards/);
  assert.match(coursePage, /Official scorecard/);
  assert.match(courseData, /slug: 'faldo'[\s\S]*noteAvailability: 'course-only'/);
  assert.match(courseData, /slug: 'oconnor'[\s\S]*noteAvailability: 'course-only'/);
  assert.match(courseData, /slug: 'old-course'[\s\S]*noteAvailability: 'hole-by-hole'/);
  assert.match(coursePage, /does not currently publish an official note for this individual hole/);
  assert.match(coursesPage, /do not contain invented hole strategy/);
  assert.match(courseData, /AGR_Faldo_13Tee_2_amendoeira\.jpg/);
  assert.match(courseData, /AGR_Oconner_Tee_18_Amendoeira\.jpg/);
  assert.doesNotMatch(courseData, /Designer%20/);
});

test('course guides are reachable from Tours, Home and a matching Golf round', () => {
  assert.match(toursPage, /href="\/courses"/);
  assert.match(toursPage, /Faldo, O’Connor and Old Course/);
  assert.match(golfPage, /courseGuideForName/);
  assert.match(golfPage, /courseGuidePath/);
});

test('Bet Punto puts the two daily market types and four quick stakes first', () => {
  assert.match(bettingPage, /market\.marketType === 'team_result'[\s\S]*round\?\.format === 'scramble'/);
  assert.match(bettingPage, /market\.marketType === 'player_performance'[\s\S]*round\?\.format !== 'scramble'/);
  assert.match(bettingPage, /Who are you\?/);
  assert.match(bettingPage, /<select value=\{selectedBettorPlayer\?\.displayName/);
  assert.match(bettingPage, /Tour accounting/);
  assert.match(bettingCard, /Highest Stableford/);
  assert.match(bettingCard, /Lowest scramble score/);
  assert.match(bettingCard, /const stakeChoices = \[500, 1000, 1500, 2000\]/);
  assert.match(bettingCard, /Place \$\{formatPenceCurrency\(selectedStakePence\)\} bet/);
});

test('Admin defaults to a live desk while retaining the full setup tools', () => {
  assert.match(adminPage, /useState<'live' \| 'setup'>\('live'\)/);
  assert.match(adminPage, /<AdminLiveDesk/);
  assert.match(adminPage, /Results, winner, publish/);
  assert.match(adminPage, /Tour, teams, rounds, pairings/);
  assert.match(adminPage, /adminMode === 'setup'/);
  assert.match(liveDesk, /Choose the round once/);
  assert.match(liveDesk, /Save draft/);
  assert.match(liveDesk, /Publish round/);
  assert.match(liveDesk, /Publish & settle bets/);
  assert.match(liveDesk, /await settleBetMarket/);
  assert.match(liveDesk, /if \(publish && incomplete\.length > 0\)/);
  assert.match(liveDesk, /if \(!publish && \(!draft\.winningSide/);
});

test('Admin market setup enforces the two agreed daily templates', () => {
  assert.match(adminPage, /const isScramble = round\.format === 'scramble'/);
  assert.match(adminPage, /highest Stableford/);
  assert.match(adminPage, /lowest scramble gross/);
  assert.match(adminPage, /Build missing daily markets/);
  assert.doesNotMatch(adminPage, /Better ball lowest score|Build better ball team market|createStablefordMarketsForRounds/);
});

test('manual refresh uses an SVG and stays with the header instead of covering scrolled content', () => {
  assert.match(refreshButton, /<svg/);
  assert.doesNotMatch(refreshButton, />↻</);
  assert.match(experienceCss, /\.manual-refresh-button\s*\{[\s\S]*position: absolute/);
});
