import { getCurrentTour, getPublicMatchBundle, getStatsBundle, withLiveData } from './_publicData';
import { predictTourWin } from '../../src/lib/winPrediction';
import { emptyOperations, type TourOperations } from '../../src/lib/tourOperations';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicAccessEvent } from './_publicAccess';

export async function getWinPrediction(db: SupabaseClient) {
  const tour = await getCurrentTour(db);
  if (!tour || tour.rulesVersion !== 'confirmed-2026') return { prediction: undefined };
  const [bundle, history, operations, years] = await Promise.all([
    getPublicMatchBundle(db), getStatsBundle(db),
    db.from('tour_operations').select('state').eq('tour_id', tour.id), db.from('tours').select('id,year'),
  ]);
  if (operations.error || years.error) throw new Error('Prediction data unavailable');
  const prediction = predictTourWin({ tour, teams: bundle.tourTeams, members: bundle.tourTeamMembers,
    roster: bundle.tourPlayers, rounds: bundle.rounds, matches: bundle.matches, participants: bundle.matchParticipants,
    history: history.matches, historyParticipants: history.matchParticipants, historicalStats: history.historicalPlayerStats,
    tourYears: Object.fromEntries((years.data ?? []).map((t) => [t.id, t.year])),
    state: (operations.data?.[0]?.state ?? emptyOperations()) as TourOperations,
    courses: bundle.tourCourses, awards: bundle.competitionAwards ?? [],
  });
  // Probabilities only: private draws and provisional allocations never leave here.
  return { prediction };
}
export const handler = (event: PublicAccessEvent) => withLiveData(event, getWinPrediction);
