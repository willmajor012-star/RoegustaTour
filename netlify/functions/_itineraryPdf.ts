import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildTourSchedule } from '../../src/lib/tourItinerary';
import type { OpsBundle } from '../../src/lib/tourOperations';
import type { Round } from '../../src/lib/types';
import type { TourItineraryItem, TourTeamDayKit } from '../../src/lib/publicApi';

export async function createItineraryPdf(b: OpsBundle, rounds: Round[], itinerary: TourItineraryItem[], kit: TourTeamDayKit[] = []) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(.06, .19, .14), muted = rgb(.28, .35, .3); let page = doc.addPage([595, 842]); let y = 784;
  const clean = (s: string) => s.replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/→/g, 'to').replace(/[^\x20-\x7e\xa0-\xff]/g, ' ');
  const line = (text: string, size = 10.5, strong = false) => { const f = strong ? bold : font; const words = clean(text).split(/\s+/); let current = ''; const lines: string[] = []; for (const word of words) { const trial = current ? current + ' ' + word : word; if (f.widthOfTextAtSize(trial, size) > 490 && current) { lines.push(current); current = word; } else current = trial; } if (current) lines.push(current); for (const l of lines) { if (y < 65) { page = doc.addPage([595, 842]); y = 784; } page.drawText(l, { x: 52, y, size, font: f, color: strong ? green : muted }); y -= size * 1.35; } y -= 3; };
  const heading = (text: string) => { if (y < 150) { page = doc.addPage([595, 842]); y = 784; } y -= 9; line(text, 15, true); };
  line(b.tour.name, 25, true);
  line(`${b.tour.startDate ?? ''} to ${b.tour.endDate ?? ''} | ${b.tour.location ?? ''}`);
  const stay = itinerary.find((i) => i.sourceType === 'accommodation');
  if (stay) line(stay.location ?? stay.activity);
  line('All times are Portugal local time.');
  const schedule = buildTourSchedule(b.tour.id, rounds, itinerary).filter((e) => e.kind !== 'activity' && e.kind !== 'accommodation');
  const dates = [...new Set(schedule.map((e) => e.itemDate).filter((date): date is string => !!date))].sort();
  for (const date of dates) {
    heading(new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }));
    const shirts = kit.filter((k) => k.kitDate === date).map((k) => `${b.teams.find((t) => t.id === k.teamId)?.name ?? 'Team'}: ${k.colourLabel}`);
    if (shirts.length) line('Shirts - ' + shirts.join(' | '), 10, true);
    for (const e of schedule.filter((e) => e.itemDate === date)) {
      if (y < 125) { page = doc.addPage([595, 842]); y = 784; }
      line(`${e.timeLabel ? e.timeLabel.replace(/^(\d{2}:\d{2}):00$/, '$1') : e.kind === 'accommodation' ? 'Stay' : 'TBC'}${e.endTimeLabel ? ' - ' + e.endTimeLabel : ''} | ${e.activity}`, 11, true);
      if (e.location) line(e.location, 10); if (e.notes) line(e.notes, 10);
    }
  }
  page = doc.addPage([595, 842]); y = 784; heading('Houses and rooms');
  for (const u of b.state.accommodation) {
    if (y < 150) { page = doc.addPage([595, 842]); y = 784; }
    line(u.name, 12, true);
    for (const r of u.rooms) line(r.name + ': ' + (r.occupants.map((o) => b.players.find((p) => p.id === o.playerId)?.displayName || o.label || 'Unassigned').join(' and ') || 'Unassigned'));
  }
  heading('Fourball starts');
  for (const s of b.state.competitions.flatMap((c) => c.sessions).filter((s) => s.startType !== 'shotgun')) {
    const times = s.groups.map((g) => g.time).filter(Boolean);
    if (times.length) line(s.title + ': ' + times.join(', '), 9.5);
  }
  if (b.tour.year === 2026 && b.state.competitions.some((c) => c.key === 'combined')) line('Monday: same partners as Friday; highest Friday pair scores start first.', 9.5);
  const pools = b.markets.filter((m) => m.poolKey && m.required && m.status !== 'void').sort((a, b) => ['friday', 'par3', 'saturday', 'sunday', 'monday', 'combined'].indexOf(a.poolKey!) - ['friday', 'par3', 'saturday', 'sunday', 'monday', 'combined'].indexOf(b.poolKey!));
  if (pools.length) {
    heading('Bet Punto');
    line(`£${pools.reduce((total, m) => total + (m.minimumStakePence ?? 0), 0) / 100} minimum each. You can bet more in £5 increments.`, 9.5);
    for (const pool of pools) {
      const cutoff = pool.closesAt ? new Date(pool.closesAt).toLocaleString('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Cutoff to follow';
      line(`${pool.title} | £${(pool.minimumStakePence ?? 0) / 100} minimum | ${cutoff}`, 9.5);
    }
    line('At cutoff, any shortfall is automatically staked on you or your own pair.', 9.5);
  }
  doc.getPages().forEach((p, i) => { p.drawLine({ start: { x: 52, y: 44 }, end: { x: 543, y: 44 }, thickness: .5, color: muted }); p.drawText(`Roegusta ${b.tour.year} | Portugal local time | ${i + 1} / ${doc.getPageCount()}`, { x: 52, y: 28, size: 8, font, color: muted }); });
  doc.setTitle(b.tour.name + ' - itinerary'); doc.setAuthor('Roegusta Tour'); return doc.save();
}
