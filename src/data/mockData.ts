import type { Bet, BetMarket, BetOption, HistoricalPlayerStats, Match, MatchParticipant, Player, Round, Tour, TourPlayer, TourTeam, TourTeamMember, TourTeamResult, PlayerMatchResult } from '../lib/types';

const now = '2026-11-06T09:00:00.000Z';
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
  { id: 'tour-2026', name: 'Roegusta Tour 2026', year: 2026, location: 'Amendoeira, Portugal', startDate: '2026-11-06', endDate: '2026-11-09', status: 'planned', description: 'The confirmed 2026 Roegusta Tour in Amendoeira, Portugal. Formats, tee times and captain picks stay flexible until captains confirm them during tour week.' },
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

export const tourTeamMembers: TourTeamMember[] = [
  ...players.slice(0, 24).map((player, index) => ({
    id: `ttm-${player.id}`,
    tourId: currentTourId,
    teamId: index % 2 === 0 ? 'team-oaks' : 'team-heath',
    playerId: player.id,
  })),
  { id: 'ttm-2025-p25', tourId: 'tour-2025', teamId: 'team-2025-a', playerId: 'p25' },
  { id: 'ttm-2025-p26', tourId: 'tour-2025', teamId: 'team-2025-b', playerId: 'p26' },
];

export const tourTeamResults: TourTeamResult[] = [
  { id: 'ttr-2025-a', tourId: 'tour-2025', teamId: 'team-2025-a', finalPoints: 1, position: 1, resultStatus: 'winner', notes: 'Imported legacy result.' },
  { id: 'ttr-2025-b', tourId: 'tour-2025', teamId: 'team-2025-b', finalPoints: 0, position: 2, resultStatus: 'runner_up', notes: 'Imported legacy result.' },
];

export const rounds: Round[] = [
  { id: 'r1', tourId: currentTourId, roundNumber: 1, name: 'Friday Opening Matches', roundDate: '2026-11-06', courseName: 'Amendoeira, Portugal', teeTime: 'TBC', formatLabel: 'Captain picks / format TBC', status: 'planned' },
  { id: 'r2', tourId: currentTourId, roundNumber: 2, name: 'Saturday Team Matches', roundDate: '2026-11-07', courseName: 'Amendoeira, Portugal', teeTime: 'TBC', formatLabel: 'Team format TBC', status: 'planned' },
  { id: 'r3', tourId: currentTourId, roundNumber: 3, name: 'Sunday Singles / Team Matches', roundDate: '2026-11-08', courseName: 'Amendoeira, Portugal', teeTime: 'TBC', formatLabel: 'Singles / team mix TBC', status: 'planned' },
  { id: 'r4', tourId: currentTourId, roundNumber: 4, name: 'Monday Final Matches', roundDate: '2026-11-09', courseName: 'Amendoeira, Portugal', teeTime: 'TBC', formatLabel: 'Final formats TBC', status: 'planned' },
  { id: 'r2025', tourId: 'tour-2025', roundNumber: 1, name: 'Legacy Singles', roundDate: '2025-06-07', courseName: 'Dorset Heath', status: 'complete' },
];

export const matches: Match[] = [
  { id: 'm1', tourId: currentTourId, roundId: 'r1', matchNumber: 1, format: 'better_ball', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: true },
  { id: 'm2', tourId: currentTourId, roundId: 'r1', matchNumber: 2, format: 'better_ball', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: true },
  { id: 'm3', tourId: currentTourId, roundId: 'r1', matchNumber: 3, format: 'better_ball', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false },
  { id: 'm4', tourId: currentTourId, roundId: 'r2', matchNumber: 1, format: 'scramble', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false, sideALabel: 'Oaks Scramble A', sideBLabel: 'Heath Scramble A' },
  { id: 'm5', tourId: currentTourId, roundId: 'r2', matchNumber: 2, format: 'scramble', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false },
  { id: 'm6', tourId: currentTourId, roundId: 'r3', matchNumber: 1, format: 'singles', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false },
  { id: 'm7', tourId: currentTourId, roundId: 'r3', matchNumber: 2, format: 'singles', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false },
  { id: 'm8', tourId: currentTourId, roundId: 'r4', matchNumber: 1, format: 'custom', status: 'planned', sideATeamId: 'team-oaks', sideBTeamId: 'team-heath', pointsAvailable: 1, teeTime: 'TBC', published: false, sideALabel: 'Captain Pick A', sideBLabel: 'Captain Pick B' },
  { id: 'm2025-1', tourId: 'tour-2025', roundId: 'r2025', matchNumber: 1, format: 'singles', status: 'complete', sideATeamId: 'team-2025-a', sideBTeamId: 'team-2025-b', pointsAvailable: 1, teeTime: 'TBC', published: true, pointsSideA: 1, pointsSideB: 0, winningSide: 'A', resultText: 'Green Jackets won' },
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


export const playerMatchResults: PlayerMatchResult[] = [
  { id: 'pmr-2025-p25', tourId: 'tour-2025', roundId: 'r2025', matchId: 'm2025-1', playerId: 'p25', teamId: 'team-2025-a', format: 'singles', result: 'win', pointsFor: 1, pointsAgainst: 0 },
  { id: 'pmr-2025-p26', tourId: 'tour-2025', roundId: 'r2025', matchId: 'm2025-1', playerId: 'p26', teamId: 'team-2025-b', format: 'singles', result: 'loss', pointsFor: 0, pointsAgainst: 1 },
];

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
  { id: 'bm1', tourId: currentTourId, roundId: 'r1', matchId: 'm1', title: 'Who wins the opening match?', description: 'Opening match market. Final teams can be linked once captains make picks.', marketType: 'match_winner', marketScope: 'general_pot', status: 'open', closesAt: '2026-11-06T08:30:00.000Z' },
  { id: 'bm2', tourId: currentTourId, roundId: 'r2', title: 'Over/under 7.5 birdies on Saturday', marketType: 'over_under', marketScope: 'special', status: 'open', closesAt: '2026-11-07T08:40:00.000Z' },
  { id: 'bm3', tourId: currentTourId, title: 'Most balls lost', marketType: 'special', marketScope: 'special', status: 'closed' },
  { id: 'bm4', tourId: currentTourId, roundId: 'r1', title: 'Which team wins the Friday session?', marketType: 'team_result', marketScope: 'general_pot', status: 'closed' },
  { id: 'bm5', tourId: currentTourId, title: 'Will anyone eagle today?', marketType: 'custom', marketScope: 'general_pot', status: 'open' },
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
  { id: 'bet1', marketId: 'bm1', optionId: 'bo1', bettorName: 'Will Major', stakeText: '£5', stakeAmount: 5, stakeAmountPence: 500, outcomeStatus: 'pending', payoutStatus: 'not_applicable', comment: 'Oaks start fast.', createdAt: now, status: 'active' },
  { id: 'bet2', marketId: 'bm1', optionId: 'bo2', bettorName: 'Finn Begley', stakeText: '£10', stakeAmount: 10, stakeAmountPence: 1000, outcomeStatus: 'pending', payoutStatus: 'not_applicable', createdAt: now, status: 'active' },
  { id: 'bet3', marketId: 'bm2', optionId: 'bo4', bettorName: 'Sam Truman', stakeText: '£5', stakeAmount: 5, stakeAmountPence: 500, outcomeStatus: 'pending', payoutStatus: 'not_applicable', comment: 'Greens are gettable.', createdAt: now, status: 'active' },
  { id: 'bet4', marketId: 'bm4', optionId: 'bo9', bettorName: 'Alex Tonge', stakeText: '£2', stakeAmount: 2, stakeAmountPence: 200, outcomeStatus: 'pending', payoutStatus: 'not_applicable', createdAt: '2026-11-06T10:00:00.000Z', status: 'active' },
];

export const itinerary = [
  'Friday 6 November: arrival, opening matches and welcome dinner.',
  'Saturday 7 November: team matches with captain-picked formats confirmed the night before.',
  'Sunday 8 November: singles / team matches depending on captain selections.',
  'Monday 9 November: final matches, trophy presentation and departures.'
];

// TODO: Replace these exports with repository-style data access functions backed by Supabase via Netlify Functions.
