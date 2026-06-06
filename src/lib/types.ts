export type Player = {
  id: string;
  displayName: string;
  nickname?: string;
  initials?: string;
  active: boolean;
  createdAt: string;
};

export type Tour = {
  id: string;
  name: string;
  year: number;
  location?: string;
  startDate?: string;
  endDate?: string;
  status: 'planned' | 'active' | 'complete' | 'archived';
  description?: string;
};

export type TourPlayer = {
  id: string;
  tourId: string;
  playerId: string;
  attending: boolean;
  tourHandicap?: number;
  notes?: string;
};

export type TourTeam = {
  id: string;
  tourId: string;
  name: string;
  colour?: string;
  captainPlayerId?: string;
  sortOrder: number;
};

export type TourTeamMember = {
  id: string;
  tourId: string;
  teamId: string;
  playerId: string;
};

export type TourTeamResult = {
  id: string;
  tourId: string;
  teamId: string;
  finalPoints?: number;
  position?: number;
  resultStatus: 'winner' | 'runner_up' | 'draw' | 'tbd';
  notes?: string;
};

export type Round = {
  id: string;
  tourId: string;
  roundNumber: number;
  name: string;
  roundDate?: string;
  courseName?: string;
  teeTime?: string;
  formatLabel?: string;
  notes?: string;
  status: 'draft' | 'planned' | 'active' | 'complete';
};

export type MatchFormat = 'singles' | 'better_ball' | 'scramble' | 'custom';

export type Match = {
  id: string;
  tourId: string;
  roundId: string;
  matchNumber: number;
  format: MatchFormat;
  status: 'draft' | 'planned' | 'active' | 'complete' | 'void';
  sideATeamId: string;
  sideBTeamId: string;
  sideALabel?: string;
  sideBLabel?: string;
  pointsAvailable: number;
  pointsSideA?: number;
  pointsSideB?: number;
  winningSide?: 'A' | 'B' | 'halved' | 'void';
  resultText?: string;
  teeTime?: string;
  published?: boolean;
  notes?: string;
};

export type MatchParticipant = {
  id: string;
  matchId: string;
  playerId: string;
  side: 'A' | 'B';
  teamId: string;
};

export type PlayerMatchResult = {
  id: string;
  tourId: string;
  roundId: string;
  matchId: string;
  playerId: string;
  teamId: string;
  format: MatchFormat;
  result: 'win' | 'draw' | 'loss' | 'void';
  pointsFor: number;
  pointsAgainst: number;
};

export type HistoricalPlayerStats = {
  id: string;
  tourId?: string;
  playerId: string;
  sourceType: 'legacy_summary';
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winPercent: number;
  notes?: string;
  importedAt: string;
};

export type BetMarket = {
  id: string;
  tourId: string;
  roundId?: string;
  matchId?: string;
  title: string;
  description?: string;
  marketType: 'match_winner' | 'player_performance' | 'team_result' | 'over_under' | 'special' | 'custom';
  status: 'open' | 'closed' | 'settled' | 'void';
  closesAt?: string;
  resultOptionId?: string;
  resultText?: string;
};

export type BetOption = {
  id: string;
  marketId: string;
  label: string;
  linkedPlayerId?: string;
  linkedTeamId?: string;
  linkedMatchSide?: 'A' | 'B' | 'halved';
  sortOrder: number;
};

export type Bet = {
  id: string;
  marketId: string;
  optionId: string;
  bettorName: string;
  /** TODO: transition persisted bets to stakeAmount/stakeAmountPence and remove stakeText compatibility. */
  stakeText?: string;
  stakeAmount?: number;
  stakeAmountPence?: number;
  comment?: string;
  createdAt: string;
  deviceId?: string;
  status: 'active' | 'void';
};

export type LeaderboardRow = {
  playerId: string;
  playerName: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winPercent: number;
};

export type TeamScoreRow = {
  teamId: string;
  teamName: string;
  colour?: string;
  points: number;
  pointsByRound: Record<string, number>;
};
