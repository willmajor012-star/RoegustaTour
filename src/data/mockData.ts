import type { Bet, BetMarket, BetOption, HistoricalPlayerStats, Match, MatchParticipant, Player, Round, Tour, TourPlayer, TourTeam, TourTeamMember } from '../lib/types';

const now = '2026-06-06T09:00:00.000Z';
const names = [
  'Will Major','Finn Begley','Sam Truman','Alex Tonge','Martin Horswood','Peter Garczewski','Remi Worthhalter','Connor Hamilton','Scott Stanley','Mike Hamblin','Adam Musikant','Dave Birn','Josh Conlan','Luke Gorman','Nick Wells','Robert Findlay','Leif Skogland','Tom Reed','Brian Crotty','Niels Verbeek','Ben Walmsley','Simon Butler','Sam Aycock','Oliver Hunt','Jack Bamford','Shaun Feldon','Dan Birn','Henry Dubiel','Sam Huxtable','Stuart Loggie'
];

export const players: Player[] = names.map((displayName, index) => ({
  id: `p${index + 1}`,
  displayName,
  initials: displayName.split(' ').map((part) => part[0]).join(''),
  nickname: index % 6 === 0 ? displayName.split(' ')[0] : undefined,
  active: true,
  createdAt: now,
}));

export const tours: Tour[] = [
  { id: 'tour-2026', name: 'Roegusta Tour 2026', year: 2026, location: 'Surrey & Berkshire', startDate: '2026-06-05', endDate: '2026-06-07', status: 'active', description: 'The current Ryder Cup-style Roegusta Tour edition.' },
  { id: 'tour-2025', name: 'Roegusta Tour 2025', year: 2025, location: 'Dorset Coast', startDate: '2025-06-06', endDate: '2025-06-08', status: 'complete', description: 'Imported legacy summary records with selected sample matches.' },
];

export const currentTourId = 'tour-2026';

export const tourPlayers: TourPlayer[] = players.slice(0, 24).map((player, index) => ({
  id: `tp-${player.id}`,
  tourId: currentTourId,
  playerId: player.id,
  attending: true,
  tourHandicap: 5 + (index % 14),
}));

export const tourTeams: TourTeam[] = [
  { id: 'team-oaks', tourId: currentTourId, name: 'The Oaks', colour: '#0F2F24', captainPlayerId: 'p1', sortOrder: 1 },
  { id: 'team-heath', tourId: currentTourId, name: 'The Heath', colour: '#6E2635', captainPlayerId: 'p2', sortOrder: 2 },
  { id: 'team-2025-a', tourId: 'tour-2025', name: 'Green Jackets', colour: '#1E4A38', sortOrder: 1 },
  { id: 'team-2025-b', tourId: 'tour-2025', name: 'Claret Crew', colour: '#6E2635', sortOrder: 2 },
];

export const tourTeamMembers: TourTeamMember[] = players.slice(0, 24).map((player, index) => ({
  id: `ttm-${player.id}`,
  tourId: currentTourId,
  teamId: index % 2 === 0 ? 'team-oaks' : 'team-heath',
  playerId: player.id,
}));

export const rounds: Round[] = [
  { id: 'r1', tourId: currentTourId, roundNumber: 1, name: 'Friday Fourballs', roundDate: '2026-06-05', courseName: 'Roehampton Club - Old Course', teeTime: '13:10', formatLabel: 'Better Ball', status: 'complete' },
  { id: 'r2', tourId: currentTourId, roundNumber: 2, name: 'Saturday Scramble', roundDate: '2026-06-06', courseName: 'Roehampton Club - Old Course', teeTime: '08:40', formatLabel: 'Scramble', status: 'active' },
  { id: 'r3', tourId: currentTourId, roundNumber: 3, name: 'Sunday Singles', roundDate: '2026-06-07', courseName: 'Roehampton Club - Inner Course', teeTime: '09:20', formatLabel: 'Singles', status: 'planned' },
  { id: 'r2025', tourId: 'tour-2025', roundNumber: 1, name: 'Legacy Singles', roundDate: '2025-06-07', courseName: 'Dorset Heath', status: 'complete' },
];

export const matches: Match[] = [
  { id: 'm1', tourId: currentTourId, roundId: 'r1', matchNumber: 1, format: 'better_ball', status: 'complete', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, pointsSideA: 1, pointsSideB: 0, winningSide: 'A', resultText: 'Oaks won 2&1' },
  { id: 'm2', tourId: currentTourId, roundId: 'r1', matchNumber: 2, format: 'better_ball', status: 'complete', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, pointsSideA: 0.5, pointsSideB: 0.5, winningSide: 'halved', resultText: 'Halved' },
  { id: 'm3', tourId: currentTourId, roundId: 'r1', matchNumber: 3, format: 'better_ball', status: 'complete', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, pointsSideA: 0, pointsSideB: 1, winningSide: 'B', resultText: 'Heath won 1 up' },
  { id: 'm4', tourId: currentTourId, roundId: 'r2', matchNumber: 1, format: 'scramble', status: 'active', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, sideALabel: 'Oaks Scramble A', sideBLabel: 'Heath Scramble A' },
  { id: 'm5', tourId: currentTourId, roundId: 'r2', matchNumber: 2, format: 'scramble', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1 },
  { id: 'm6', tourId: currentTourId, roundId: 'r3', matchNumber: 1, format: 'singles', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1 },
  { id: 'm7', tourId: currentTourId, roundId: 'r3', matchNumber: 2, format: 'singles', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1 },
  { id: 'm8', tourId: currentTourId, roundId: 'r3', matchNumber: 3, format: 'custom', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, sideALabel: 'Captain Pick A', sideBLabel: 'Captain Pick B' },
  { id: 'm2025-1', tourId: 'tour-2025', roundId: 'r2025', matchNumber: 1, format: 'singles', status: 'complete', sideATeamId: 'team-2025-a', sideBTeamId: 'team-2025-b', pointsAvailable: 1, pointsSideA: 1, pointsSideB: 0, winningSide: 'A', resultText: 'Green Jackets won' },
];

const sides: Record<string, string[][]> = {
  m1: [['p1','p3'], ['p2','p4']],
  m2: [['p5','p7'], ['p6','p8']],
  m3: [['p9','p11'], ['p10','p12']],
  m4: [['p13','p15','p17'], ['p14','p16','p18']],
  m5: [['p19','p21','p23'], ['p20','p22','p24']],
  m6: [['p1'], ['p2']],
  m7: [['p3'], ['p4']],
  m8: [['p5','p7'], ['p6','p8']],
  'm2025-1': [['p25'], ['p26']],
};

export const matchParticipants: MatchParticipant[] = Object.entries(sides).flatMap(([matchId, [a, b]]) => {
  const match = matches.find((item) => item.id === matchId)!;
  return [
    ...a.map((playerId) => ({ id: `mp-${matchId}-${playerId}`, matchId, playerId, side: 'A' as const, teamId: match.sideATeamId })),
    ...b.map((playerId) => ({ id: `mp-${matchId}-${playerId}`, matchId, playerId, side: 'B' as const, teamId: match.sideBTeamId })),
  ];
});

export const historicalPlayerStats: HistoricalPlayerStats[] = players.slice(0, 18).map((player, index) => {
  const wins = 2 + (index % 4);
  const draws = index % 3 === 0 ? 1 : 0;
  const losses = 2 + (index % 2);
  const matches = wins + draws + losses;
  const points = wins + draws * 0.5;

  return {
    id: `hist-${player.id}`,
    tourId: index < 12 ? 'tour-2025' : undefined,
    playerId: player.id,
    sourceType: 'legacy_summary',
    matches,
    wins,
    draws,
    losses,
    points,
    winPercent: matches > 0 ? points / matches : 0,
    notes: 'Imported from legacy tour spreadsheet summary.',
    importedAt: now,
  };
});

export const betMarkets: BetMarket[] = [
  { id: 'bm1', tourId: currentTourId, roundId: 'r2', matchId: 'm4', title: 'Who wins Match 1?', description: 'Saturday scramble opener.', marketType: 'match_winner', status: 'open', closesAt: '2026-06-06T08:30:00.000Z' },
  { id: 'bm2', tourId: currentTourId, roundId: 'r2', title: 'Over/under 7.5 birdies today', marketType: 'over_under', status: 'open', closesAt: '2026-06-06T08:40:00.000Z' },
  { id: 'bm3', tourId: currentTourId, title: 'Most balls lost', marketType: 'special', status: 'closed' },
  { id: 'bm4', tourId: currentTourId, roundId: 'r1', title: 'Which team wins the Friday session?', marketType: 'team_result', status: 'settled', resultOptionId: 'bo9', resultText: 'Session was tied 1.5 - 1.5.' },
  { id: 'bm5', tourId: currentTourId, title: 'Will anyone eagle today?', marketType: 'custom', status: 'open' },
];

export const betOptions: BetOption[] = [
  { id: 'bo1', marketId: 'bm1', label: 'The Oaks', linkedTeamId: 'team-oaks', linkedMatchSide: 'A', sortOrder: 1 },
  { id: 'bo2', marketId: 'bm1', label: 'The Heath', linkedTeamId: 'team-heath', linkedMatchSide: 'B', sortOrder: 2 },
  { id: 'bo3', marketId: 'bm1', label: 'Halved', linkedMatchSide: 'halved', sortOrder: 3 },
  { id: 'bo4', marketId: 'bm2', label: 'Over 7.5', sortOrder: 1 },
  { id: 'bo5', marketId: 'bm2', label: 'Under 7.5', sortOrder: 2 },
  { id: 'bo6', marketId: 'bm3', label: 'Finn Begley', linkedPlayerId: 'p2', sortOrder: 1 },
  { id: 'bo7', marketId: 'bm3', label: 'Sam Truman', linkedPlayerId: 'p3', sortOrder: 2 },
  { id: 'bo8', marketId: 'bm4', label: 'The Oaks', linkedTeamId: 'team-oaks', sortOrder: 1 },
  { id: 'bo9', marketId: 'bm4', label: 'Tied session', sortOrder: 2 },
  { id: 'bo10', marketId: 'bm5', label: 'Yes', sortOrder: 1 },
  { id: 'bo11', marketId: 'bm5', label: 'No', sortOrder: 2 },
];

export const bets: Bet[] = [
  { id: 'bet1', marketId: 'bm1', optionId: 'bo1', bettorName: 'Will Major', stakeText: 'One post-round pint', comment: 'Oaks start fast.', createdAt: now, status: 'active' },
  { id: 'bet2', marketId: 'bm1', optionId: 'bo2', bettorName: 'Finn Begley', stakeText: 'Bragging rights', createdAt: now, status: 'active' },
  { id: 'bet3', marketId: 'bm2', optionId: 'bo4', bettorName: 'Sam Truman', stakeText: '£5 charity pot', comment: 'Greens are gettable.', createdAt: now, status: 'active' },
  { id: 'bet4', marketId: 'bm4', optionId: 'bo9', bettorName: 'Alex Tonge', stakeText: 'Called it', createdAt: '2026-06-05T10:00:00.000Z', status: 'active' },
];

export const itinerary = [
  'Friday: arrival, warm-up fourballs, welcome dinner.',
  'Saturday: morning scramble, lunch on the terrace, afternoon challenges.',
  'Sunday: singles, trophy presentation and departure.'
];

// TODO: Replace these exports with repository-style data access functions backed by Supabase via Netlify Functions.
