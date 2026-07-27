import type { Bet, BetMarket, BetOption, CourseGuide, CourseHole, CourseTee, HistoricalPlayerStats, Match, MatchParticipant, Player, PlayerMatchResult, Round, RoundPrizeResult, Tour, TourPlayer, TourPrizeFund, TourTeam, TourTeamMember, TourTeamResult } from '../../src/lib/types';
import type { TourHandbookSection, TourItineraryItem, TourTeamDayKit } from '../../src/lib/publicApi';

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

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapCourseTee(value: unknown): CourseTee | undefined {
  const row = value && typeof value === 'object' ? value as Row : {};
  const key = asString(row.key);
  const label = asString(row.label);
  if (!key || !label) return undefined;
  return { key, label, colour: asString(row.colour) ?? '#0f2f24', textColour: asString(row.textColour) };
}

function mapCourseHole(value: unknown): CourseHole | undefined {
  const row = value && typeof value === 'object' ? value as Row : {};
  const number = asNumber(row.number);
  const par = asNumber(row.par);
  const strokeIndex = asNumber(row.strokeIndex);
  const rawYards = row.yards && typeof row.yards === 'object' ? row.yards as Row : {};
  if (number === undefined || par === undefined || strokeIndex === undefined) return undefined;
  const yards = Object.fromEntries(Object.entries(rawYards).map(([key, distance]) => [key, asNumber(distance) ?? 0]));
  return { number, par, strokeIndex, yards, officialNote: asString(row.officialNote) };
}

function mapTourPrizeFund(value: unknown): TourPrizeFund | undefined {
  const row = value && typeof value === 'object' ? value as Row : {};
  const contributionPence = asNumber(row.contributionPence);
  if (contributionPence === undefined || contributionPence < 0) return undefined;
  const rounds = asArray(row.rounds).map((candidate) => {
    const round = candidate && typeof candidate === 'object' ? candidate as Row : {};
    const roundNumber = asNumber(round.roundNumber);
    const paidPer = round.paidPer === 'player' ? 'player' as const : round.paidPer === 'pair' ? 'pair' as const : undefined;
    const payoutsPence = asArray(round.payoutsPence)
      .map(asNumber)
      .filter((amount): amount is number => amount !== undefined && amount >= 0);
    return roundNumber !== undefined && paidPer && payoutsPence.length > 0
      ? { roundNumber, paidPer, payoutsPence }
      : undefined;
  }).filter((round): round is TourPrizeFund['rounds'][number] => Boolean(round));
  if (rounds.length === 0) return undefined;
  return {
    contributionPence,
    totalPence: asNumber(row.totalPence),
    rules: asArray(row.rules).map(asString).filter((rule): rule is string => Boolean(rule)),
    rounds,
  };
}

export function mapPlayer(row: Row): Player {
  return {
    id: requiredString(row, 'id'),
    displayName: requiredString(row, 'display_name'),
    nickname: asString(row.nickname),
    initials: asString(row.initials),
    photoUrl: asString(row.photo_url),
    photoPath: asString(row.photo_path),
    profileBio: asString(row.profile_bio),
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
    timezone: asString(row.timezone) ?? 'Europe/Lisbon',
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    status: requiredString(row, 'status') as Tour['status'],
    description: asString(row.description),
    prizeFund: mapTourPrizeFund(row.prize_fund),
    isCurrentPublic: asBoolean(row.is_current_public),
    isTest: asBoolean(row.is_test),
  };
}


export function mapTourPlayer(row: Row): TourPlayer {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    playerId: requiredString(row, 'player_id'),
    attending: asBoolean(row.attending, true),
    tourHandicap: asNumber(row.tour_handicap),
    notes: asString(row.notes),
    nickname: asString(row.nickname),
    photoUrl: asString(row.photo_url),
    photoPath: asString(row.photo_path),
    profileBio: asString(row.profile_bio),
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
    published: asBoolean(row.published),
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
    courseId: asString(row.course_id),
    courseName: asString(row.course_name),
    teeTime: asString(row.tee_time),
    format: asString(row.format) as Round['format'],
    formatLabel: asString(row.format_label),
    holes: (asNumber(row.holes) === 9 ? 9 : 18),
    notes: asString(row.notes),
    status: requiredString(row, 'status') as Round['status'],
    published: asBoolean(row.published),
  };
}

export function mapCourseGuide(row: Row): CourseGuide {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    shortName: requiredString(row, 'short_name'),
    resort: asString(row.resort) ?? '',
    location: asString(row.location) ?? '',
    architect: asString(row.architect) ?? '',
    opened: asString(row.opened),
    overview: asString(row.overview) ?? '',
    noteAvailability: (asString(row.note_availability) ?? 'course-only') as CourseGuide['noteAvailability'],
    officialPageUrl: asString(row.official_page_url),
    scorecardUrl: asString(row.scorecard_url),
    heroImageUrl: asString(row.hero_image_url),
    heroPosition: asString(row.hero_position),
    tees: asArray(row.tees).map(mapCourseTee).filter((tee): tee is CourseTee => Boolean(tee)),
    holes: asArray(row.holes).map(mapCourseHole).filter((hole): hole is CourseHole => Boolean(hole)).sort((a, b) => a.number - b.number),
    sortOrder: asNumber(row.sort_order) ?? 0,
    published: asBoolean(row.published),
    showOnHome: asBoolean(row.show_on_home),
  };
}


export function mapRoundPrizeResult(row: Row): RoundPrizeResult {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    roundId: requiredString(row, 'round_id'),
    prizeType: requiredString(row, 'prize_type') as RoundPrizeResult['prizeType'],
    title: requiredString(row, 'title'),
    winnerPlayerId: asString(row.winner_player_id),
    winnerTeamId: asString(row.winner_team_id),
    winningScoreText: asString(row.winning_score_text),
    scoreValue: asNumber(row.score_value),
    scoreUnit: asString(row.score_unit),
    notes: asString(row.notes),
    linkedBetMarketId: asString(row.linked_bet_market_id),
    published: asBoolean(row.published, true),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: asString(row.updated_at),
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
    marketScope: (asString(row.market_scope) ?? 'general_pot') as BetMarket['marketScope'],
    closesAt: asString(row.closes_at),
    resultOptionId: asString(row.result_option_id),
    resultText: asString(row.result_text),
    required: asBoolean(row.required) ?? false,
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
    oddsDecimal: asNumber(row.odds_decimal),
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
    stakeAmount: asNumber(row.stake_amount_pence) === undefined ? undefined : Number(asNumber(row.stake_amount_pence)) / 100,
    stakeAmountPence: asNumber(row.stake_amount_pence),
    payoutAmountPence: asNumber(row.payout_amount_pence),
    outcomeStatus: (asString(row.outcome_status) ?? 'pending') as Bet['outcomeStatus'],
    payoutStatus: (asString(row.payout_status) ?? 'not_applicable') as Bet['payoutStatus'],
    payoutNotes: asString(row.payout_notes),
    comment: asString(row.comment),
    bettorPlayerId: asString(row.bettor_player_id),
    adminEntered: Boolean(row.admin_entered),
    entrySource: (asString(row.entry_source) ?? (row.admin_entered ? 'admin' : 'public')) as Bet['entrySource'],
    adminNotes: asString(row.admin_notes),
    voidReason: asString(row.void_reason),
    createdAt: requiredString(row, 'created_at'),
    updatedAt: asString(row.updated_at),
    deviceId: asString(row.device_id),
    status: requiredString(row, 'status') as Bet['status'],
  };
}

export function mapTourHandbookSection(row: Row): TourHandbookSection {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    sectionKey: requiredString(row, 'section_key'),
    title: requiredString(row, 'title'),
    body: asString(row.body),
    sortOrder: requiredNumber(row, 'sort_order'),
  };
}

function legacyRoundItinerarySourceId(value: unknown): string | undefined {
  return asString(value)?.match(/\[round:([^\]]+)\]/i)?.[1]?.trim() || undefined;
}

function publicItineraryNotes(value: unknown): string | undefined {
  const cleaned = asString(value)?.replace(/\s*\[round:[^\]]+\]\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned || undefined;
}

export function mapTourItineraryItem(row: Row): TourItineraryItem {
  const sourceId = asString(row.source_id) ?? legacyRoundItinerarySourceId(row.notes);
  const sourceType = asString(row.source_type) ?? (sourceId ? 'round' : undefined);
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    itemDate: asString(row.item_date),
    dayLabel: asString(row.day_label),
    timeLabel: asString(row.time_label),
    endTimeLabel: asString(row.end_time_label),
    activity: requiredString(row, 'activity'),
    location: asString(row.location),
    notes: publicItineraryNotes(row.notes),
    isPlaceholder: asBoolean(row.is_placeholder),
    sortOrder: requiredNumber(row, 'sort_order'),
    sourceType,
    sourceId,
  };
}

export function mapTourTeamDayKit(row: Row): TourTeamDayKit {
  return {
    id: requiredString(row, 'id'),
    tourId: requiredString(row, 'tour_id'),
    teamId: requiredString(row, 'team_id'),
    kitDate: requiredString(row, 'kit_date'),
    colourLabel: requiredString(row, 'colour_label'),
    sortOrder: requiredNumber(row, 'sort_order'),
  };
}
