import type { Bet, BetMarket, BetOption, HistoricalPlayerStats, Match, MatchParticipant, Player, PlayerMatchResult, Round, Tour, TourTeam, TourTeamMember, TourTeamResult } from '../../src/lib/types';

type Row = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(row: Row, key: string): string {
  const value = asString(row[key]);
  if (!value) throw new Error(`Supabase row is missing required string field: ${key}`);
  return value;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function requiredNumber(row: Row, key: string): number {
  const value = asNumber(row[key]);
  if (value === undefined) throw new Error(`Supabase row is missing required numeric field: ${key}`);
  return value;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function mapPlayer(row: Row): Player {
  return {
    id: requiredString(row, 'id'),
    displayName: requiredString(row, 'display_name'),
    nickname: asString(row.nickname),
    initials: asString(row.initials),
    active: asBoolean(row.active, true),
    createdAt: requiredString(row, 'created_at'),
  };
}

export function mapTour(row: Row): Tour {
  return {
    id: requiredString(row, 'id'),
    name: requiredString(row, 'name'),
    year: requiredNumber(row, 'year'),
    location: asString(row.location),
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    status: requiredString(row, 'status') as Tour['status'],
    description: asString(row.description),
  };
}

export function mapTourTeam(row: Row): TourTeam {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    name: requiredString(row, 'name'),
    colour: asString(row.colour),
    captainPlayerId: asString(row.captain_player_id),
    sortOrder: requiredNumber(row, 'sort_order'),
  };
}


export function mapTourTeamMember(row: Row): TourTeamMember {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    teamId: requiredString(row, 'team_id'),
    playerId: requiredString(row, 'player_id'),
  };
}

export function mapTourTeamResult(row: Row): TourTeamResult {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    teamId: requiredString(row, 'team_id'),
    finalPoints: asNumber(row.final_points),
    position: asNumber(row.position),
    resultStatus: requiredString(row, 'result_status') as TourTeamResult['resultStatus'],
    notes: asString(row.notes),
  };
}

export function mapRound(row: Row): Round {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    roundNumber: requiredNumber(row, 'round_number'),
    name: requiredString(row, 'name'),
    roundDate: asString(row.round_date),
    courseName: asString(row.course_name),
    teeTime: asString(row.tee_time),
    formatLabel: asString(row.format_label),
    notes: asString(row.notes),
    status: requiredString(row, 'status') as Round['status'],
  };
}

export function mapMatch(row: Row): Match {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    roundId: requiredString(row, 'round_id'),
    matchNumber: requiredNumber(row, 'match_number'),
    format: requiredString(row, 'format') as Match['format'],
    status: requiredString(row, 'status') as Match['status'],
    sideATeamId: requiredString(row, 'side_a_team_id'),
    sideBTeamId: requiredString(row, 'side_b_team_id'),
    sideALabel: asString(row.side_a_label),
    sideBLabel: asString(row.side_b_label),
    pointsAvailable: requiredNumber(row, 'points_available'),
    pointsSideA: asNumber(row.points_side_a),
    pointsSideB: asNumber(row.points_side_b),
    winningSide: asString(row.winning_side) as Match['winningSide'],
    resultText: asString(row.result_text),
    teeTime: asString(row.tee_time),
    published: asBoolean(row.published),
    notes: asString(row.notes),
  };
}

export function mapMatchParticipant(row: Row): MatchParticipant {
  return {
    id: requiredString(row, 'id'),
    matchId: requiredString(row, 'match_id'),
    playerId: requiredString(row, 'player_id'),
    side: requiredString(row, 'side') as MatchParticipant['side'],
    teamId: requiredString(row, 'team_id'),
  };
}


export function mapPlayerMatchResult(row: Row): PlayerMatchResult {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    roundId: requiredString(row, 'round_id'),
    matchId: requiredString(row, 'match_id'),
    playerId: requiredString(row, 'player_id'),
    teamId: requiredString(row, 'team_id'),
    format: requiredString(row, 'format') as PlayerMatchResult['format'],
    result: requiredString(row, 'result') as PlayerMatchResult['result'],
    pointsFor: requiredNumber(row, 'points_for'),
    pointsAgainst: requiredNumber(row, 'points_against'),
  };
}

export function mapHistoricalPlayerStats(row: Row): HistoricalPlayerStats {
  return {
    id: requiredString(row, 'id'),
    tourId: asString(row.tour_id),
    playerId: requiredString(row, 'player_id'),
    sourceType: requiredString(row, 'source_type') as HistoricalPlayerStats['sourceType'],
    matches: requiredNumber(row, 'matches'),
    wins: requiredNumber(row, 'wins'),
    draws: requiredNumber(row, 'draws'),
    losses: requiredNumber(row, 'losses'),
    points: requiredNumber(row, 'points'),
    winPercent: requiredNumber(row, 'win_percent'),
    notes: asString(row.notes),
    importedAt: requiredString(row, 'imported_at'),
  };
}

export function mapBetMarket(row: Row): BetMarket {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    roundId: asString(row.round_id),
    matchId: asString(row.match_id),
    title: requiredString(row, 'title'),
    description: asString(row.description),
    marketType: requiredString(row, 'market_type') as BetMarket['marketType'],
    status: requiredString(row, 'status') as BetMarket['status'],
    closesAt: asString(row.closes_at),
    resultOptionId: asString(row.result_option_id),
    resultText: asString(row.result_text),
  };
}

export function mapBetOption(row: Row): BetOption {
  return {
    id: requiredString(row, 'id'),
    marketId: requiredString(row, 'market_id'),
    label: requiredString(row, 'label'),
    linkedPlayerId: asString(row.linked_player_id),
    linkedTeamId: asString(row.linked_team_id),
    linkedMatchSide: asString(row.linked_match_side) as BetOption['linkedMatchSide'],
    sortOrder: requiredNumber(row, 'sort_order'),
  };
}

export function mapBet(row: Row): Bet {
  return {
    id: requiredString(row, 'id'),
    marketId: requiredString(row, 'market_id'),
    optionId: requiredString(row, 'option_id'),
    bettorName: requiredString(row, 'bettor_name'),
    stakeText: asString(row.stake_text),
    comment: asString(row.comment),
    createdAt: requiredString(row, 'created_at'),
    deviceId: asString(row.device_id),
    status: requiredString(row, 'status') as Bet['status'],
  };
}
