export type Player = {
  id: string;
  displayName: string;
  nickname?: string;
  initials?: string;
  photoUrl?: string;
  photoPath?: string;
  profileBio?: string;
  active: boolean;
  createdAt: string;
};

export type TourPrizeFundRound = {
  roundNumber: number;
  paidPer: 'pair' | 'player';
  payoutsPence: number[];
};

export type TourPrizeFund = {
  contributionPence: number;
  totalPence?: number;
  rules: string[];
  rounds: TourPrizeFundRound[];
};

export type Tour = {
  id: string;
  name: string;
  year: number;
  location?: string;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  status: 'planned' | 'active' | 'complete' | 'archived';
  description?: string;
  prizeFund?: TourPrizeFund;
  isCurrentPublic?: boolean;
  isTest?: boolean;
};

export type TourPlayer = {
  id: string;
  tourId: string;
  playerId: string;
  attending: boolean;
  tourHandicap?: number;
  notes?: string;
  nickname?: string;
  photoUrl?: string;
  photoPath?: string;
  profileBio?: string;
};

export type TourTeam = {
  id: string;
  tourId: string;
  name: string;
  colour?: string;
  captainPlayerId?: string;
  sortOrder: number;
  published?: boolean;
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

export type MatchFormat = 'singles' | 'better_ball' | 'foursomes' | 'scramble' | 'custom';

export type CourseTee = {
  key: string;
  label: string;
  colour: string;
  textColour?: string;
};

export type CourseHole = {
  number: number;
  par: number;
  strokeIndex: number;
  yards: Record<string, number>;
  officialNote?: string;
};

export type CourseGuide = {
  id?: string;
  tourId?: string;
  slug: string;
  name: string;
  shortName: string;
  resort: string;
  location: string;
  architect: string;
  opened?: string;
  overview: string;
  noteAvailability: 'course-only' | 'hole-by-hole';
  officialPageUrl?: string;
  scorecardUrl?: string;
  heroImageUrl?: string;
  heroPosition?: string;
  tees: CourseTee[];
  holes: CourseHole[];
  sortOrder?: number;
  published?: boolean;
  showOnHome?: boolean;
};

export type Round = {
  id: string;
  tourId: string;
  roundNumber: number;
  name: string;
  roundDate?: string;
  courseId?: string;
  courseName?: string;
  teeTime?: string;
  format?: MatchFormat;
  formatLabel?: string;
  holes: 9 | 18;
  notes?: string;
  status: 'draft' | 'planned' | 'active' | 'complete';
  published?: boolean;
};


export type RoundPrizeResult = {
  id: string;
  tourId: string;
  roundId: string;
  prizeType: 'individual_stableford' | 'team_gross' | 'custom';
  title: string;
  winnerPlayerId?: string;
  winnerTeamId?: string;
  winningScoreText?: string;
  scoreValue?: number;
  scoreUnit?: string;
  notes?: string;
  linkedBetMarketId?: string;
  published: boolean;
  createdAt: string;
  updatedAt?: string;
};

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
  status: 'draft' | 'open' | 'closed' | 'settled' | 'void';
  marketScope: 'general_pot' | 'special';
  closesAt?: string;
  resultOptionId?: string;
  resultText?: string;
  required?: boolean;
};

export type BetOption = {
  id: string;
  marketId: string;
  label: string;
  linkedPlayerId?: string;
  linkedTeamId?: string;
  linkedMatchSide?: 'A' | 'B' | 'halved';
  oddsDecimal?: number;
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
  payoutAmountPence?: number;
  outcomeStatus: 'pending' | 'won' | 'lost' | 'void' | 'push';
  payoutStatus: 'unpaid' | 'paid' | 'not_applicable';
  payoutNotes?: string;
  comment?: string;
  bettorPlayerId?: string;
  adminEntered?: boolean;
  entrySource?: 'public' | 'admin' | 'automatic_default';
  adminNotes?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt?: string;
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
