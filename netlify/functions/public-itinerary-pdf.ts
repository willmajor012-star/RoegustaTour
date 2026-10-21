import { createServerSupabaseClient } from './_supabase';
import { requirePublicAccess, type PublicAccessEvent } from './_publicAccess';
import { getCurrentTour } from './_publicData';
import { readOperations } from './_tourOperations';
import { runRows } from './_adminSupabase';
import { mapRound, mapTourItineraryItem } from './_mappers';
import { createItineraryPdf } from './_itineraryPdf';
export const handler = async (event: PublicAccessEvent) => {
  try {
    const db = createServerSupabaseClient(); const denied = await requirePublicAccess(event, db); if (denied) return denied;
    const tour = await getCurrentTour(db); if (!tour) return { statusCode: 404, body: 'No public tour.' };
    const [bundle, rounds, itinerary] = await Promise.all([readOperations(db, tour.id), runRows(db.from('rounds').select('*').eq('tour_id', tour.id).eq('published', true), 'itinerary rounds'), runRows(db.from('tour_itinerary_items').select('*').eq('tour_id', tour.id), 'editable itinerary')]);
    const bytes = await createItineraryPdf(bundle, rounds.map(mapRound), itinerary.map(mapTourItineraryItem));
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { statusCode: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="Roegusta-Tour-${tour.year}-Itinerary.pdf"`, 'cache-control': 'no-store' }, isBase64Encoded: true, body: btoa(binary) };
  } catch (error) { console.error('Itinerary PDF failed', error); return { statusCode: 500, body: 'The itinerary could not be generated. Please try again.' }; }
};
