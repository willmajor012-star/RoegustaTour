import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildTourSchedule } from '../../src/lib/tourItinerary';
import type { OpsBundle } from '../../src/lib/tourOperations';
import type { Round } from '../../src/lib/types';
import type { TourItineraryItem } from '../../src/lib/publicApi';

export async function createItineraryPdf(b: OpsBundle, rounds: Round[], itinerary: TourItineraryItem[]) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(.06, .19, .14), muted = rgb(.28, .35, .3); let page = doc.addPage([595, 842]); let y = 784;
  const clean = (s: string) => s.replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/→/g, 'to').replace(/[^\x20-\x7e\xa0-\xff]/g, ' ');
  const line = (text: string, size = 10.5, strong = false) => { const f = strong ? bold : font; const words = clean(text).split(/\s+/); const lines: string[] = []; let current = ''; for (const word of words) { const trial = current ? current + ' ' + word : word; if (f.widthOfTextAtSize(trial, size) > 490 && current) { lines.push(current); current = word; } else current = trial; } if (current) lines.push(current); for (const l of lines) { if (y < 65) { page = doc.addPage([595, 842]); y = 784; } page.drawText(l, { x: 52, y, size, font: f, color: strong ? green : muted }); y -= size * 1.5; } y -= 5; };
  const heading = (text: string) => { if (y < 140) { page = doc.addPage([595, 842]); y = 784; } y -= 10; line(text, 15, true); };
  line(b.tour.name, 26, true); line(`${b.tour.startDate ?? 'Dates to confirm'} to ${b.tour.endDate ?? ''} | ${b.tour.location ?? ''}`, 13, true);
  line(`All golf starts and betting cutoffs use ${b.tour.timezone ?? 'the saved tour timezone'}. Generated from the saved app itinerary and room assignments.`);
  heading('Programme');
  const schedule = buildTourSchedule(b.tour.id, rounds, itinerary);
  for (const entry of schedule) {
    if (y < 155) { page = doc.addPage([595, 842]); y = 784; }
    const date = entry.itemDate ? new Date(entry.itemDate + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' }) : 'Date to confirm';
    const time = entry.timeLabel?.replace(/^(\d{2}:\d{2}):00$/, '$1');
    line(`${date} | ${time ?? (entry.kind === 'accommodation' ? 'Stay' : 'Information')}${entry.endTimeLabel ? '-' + entry.endTimeLabel : ''} | ${entry.activity}`, 11, true);
    if (entry.location) line(entry.location); if (entry.notes) line(entry.notes);
  }
  if (b.tour.rulesVersion === 'confirmed-2026') {
  heading('Golf and tour points');
  line('Friday Faldo nine: own-ball fourball better ball Stableford. Record each golfer\'s hole scores; the higher partner points count on each hole.');
  line('Monday final nine: two-man scramble Stableford using the agreed scramble handicap, not scratch. Keep Friday\'s partners. Add both nine-hole totals: all 18 holes count, not an eclectic.');
  line('Combined positions 1-12 award 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1 and 0.5 points to the pairs\' main tour sides, once only (39 total). Saturday matchplay has 6 points; Sunday singles has 12; Par 3 has zero. Total 57. 29 guarantees victory; 28.5-28.5 is a tie.');
  line('Combined countback: Monday nine, Monday last six, last three, final hole, then Friday nine, last six, last three, final hole. Use chronological playing order. If still tied, a recorded admin ranking decision is required.');
  line('Friday Par 3: separate fun scratch two-man scramble Stableford with an independent random draw and betting pool. Booking 19:30-21:30. Hole count and scorecard await confirmation.');
  line('Saturday betting: highest PAIR better ball Stableford over all 18 holes. Sunday betting: highest INDIVIDUAL Stableford over all 18 holes. Record remaining holes after an early matchplay finish; a concession does not invent a gross score.');
  heading('Tee sheets and Monday order');
  line('Friday Faldo: 14:20, 14:30, 14:40, 14:50, 15:00, 15:10.');
  line('Saturday: first start 10:00. Remaining tee times await a confirmed interval.');
  line('Sunday: 11:24, 11:32, 11:40, 11:48, 11:56, 12:04.');
  line('Monday: highest Friday scores FIRST. Friday-ranked pairs 1-2 at 10:00; 3-4 at 10:10; 5-6 at 10:20; 7-8 at 10:30; 9-10 at 10:40; 11-12 at 10:50. Friday ties use last six, last three, final hole, then a recorded admin order. Pair identities stay the same; fourballs change. The published tee sheet requires an explicit update if Friday scores change.');
  heading('Bet Punto: six separate pool commitments');
  for (const m of b.markets.filter((v) => v.poolKey)) { const cutoff = new Date(m.closesAt!).toLocaleString('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); line(`${m.title}: minimum £${(m.minimumStakePence ?? 0) / 100} per tourist. Cutoff ${cutoff}.`, 10.5, true); }
  line('Minimum £45 per tourist (£1,080 for 24). Friday requires £20: Faldo £5 + combined £5 + Par 3 £10, with separate cutoffs. Saturday £10, Sunday £10, Monday £5. These are minimums, not caps. Stakes stay in £5 increments; two valid £5 picks satisfy a £10 pool. Extra stakes in one pool do not cover another.');
  line('At each pool\'s cutoff the server automatically places ONLY any remaining shortfall on your own competition pair, or yourself on Sunday. Existing valid bets on other selections count and remain unchanged. £0 in a £10 pool adds £10; £5 adds £5; £10 or more adds nothing. Missing own-pair assignments are flagged for an organiser. The combined pool closes before Friday play. Automatic bets are social ledger entries, not payment collection.');
  }
  heading('Houses and rooms');
  for (const u of b.state.accommodation) { if (y < 140) { page = doc.addPage([595, 842]); y = 784; } line(u.name, 12, true); for (const r of u.rooms) line(r.name + ': ' + (r.occupants.map((o) => o.label || b.players.find((p) => p.id === o.playerId)?.displayName || 'Unassigned').join(' and ') || 'Unassigned')); }
  if (b.state.accommodation.some((u) => u.rooms.some((r) => r.occupants.some((o) => !o.playerId)))) line('Unresolved room names retain the supplied labels until matched to permanent player profiles. Accommodation does not determine golf partners or tour sides.');
  heading('Using the app on tour');
  line('Install Roegusta from the visible app entry point. iPhone/iPad: open in Safari, Share, Add to Home Screen; enable Open as Web App if shown, then Add. Android: use the Install button when offered, or Chrome menu > Add to home screen / Install app. Open the installed icon and sign in if asked. An internet connection is needed to load and save live scores and bets; wait for the saved confirmation.');
  line('The Download itinerary link regenerates this PDF from saved itinerary and room data on every request. Organisers can update Plan and Rooms without replacing a hardcoded file.');
  doc.getPages().forEach((p, i) => { p.drawLine({ start: { x: 52, y: 44 }, end: { x: 543, y: 44 }, thickness: .5, color: muted }); p.drawText(`Roegusta ${b.tour.year} | ${b.tour.timezone ?? 'Tour local times'} | ${i + 1} / ${doc.getPageCount()}`, { x: 52, y: 28, size: 8, font, color: muted }); });
  doc.setTitle(b.tour.name + ' - itinerary'); doc.setAuthor('Roegusta Tour');
  return doc.save();
}
