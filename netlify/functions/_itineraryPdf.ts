import { PDFDocument, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { buildTourSchedule, restaurantMapUrl } from '../../src/lib/tourItinerary';
import type { OpsBundle } from '../../src/lib/tourOperations';
import type { Round } from '../../src/lib/types';
import type { TourItineraryItem, TourTeamDayKit } from '../../src/lib/publicApi';

export async function createItineraryPdf(b: OpsBundle, rounds: Round[], itinerary: TourItineraryItem[], kit: TourTeamDayKit[] = []) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(.06, .19, .14), muted = rgb(.28, .35, .3); let page = doc.addPage([595, 842]); let y = 784; let x = 52; let textWidth = 490;
  const clean = (s: string) => s.replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/→/g, 'to').replace(/[^\x20-\x7e\xa0-\xff]/g, ' ');
  const line = (text: string, size = 10.5, strong = false) => { const f = strong ? bold : font; const words = clean(text).split(/\s+/); let current = ''; const lines: string[] = []; for (const word of words) { const trial = current ? current + ' ' + word : word; if (f.widthOfTextAtSize(trial, size) > textWidth && current) { lines.push(current); current = word; } else current = trial; } if (current) lines.push(current); for (const l of lines) { if (y < 65) { page = doc.addPage([595, 842]); y = 784; } page.drawText(l, { x, y, size, font: f, color: strong ? green : muted }); y -= size * 1.35; } y -= 1.5; };
  const heading = (text: string) => { if (y < 150) { page = doc.addPage([595, 842]); y = 784; } y -= 9; line(text, 15, true); };
  const mapLink = (url: string) => {
    const text = 'Open in Maps'; const size = 10; const width = font.widthOfTextAtSize(text, size);
    if (y < 65) { page = doc.addPage([595, 842]); y = 784; }
    page.drawText(text, { x, y, size, font, color: green });
    page.drawLine({ start: { x, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: .5, color: green });
    page.node.addAnnot(doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y - 3, x + width, y + size], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } })));
    y -= 15;
  };
  line(b.tour.name, 25, true);
  line(`${b.tour.startDate ?? ''} to ${b.tour.endDate ?? ''} | ${b.tour.location ?? ''}`);
  const stay = itinerary.find((i) => i.sourceType === 'accommodation');
  if (stay) line(stay.location ?? stay.activity);
  line('All times are Portugal local time.');
  const schedule = buildTourSchedule(b.tour.id, rounds, itinerary).filter((e) => e.kind !== 'activity' && e.kind !== 'accommodation');
  const dates = [...new Set(schedule.map((e) => e.itemDate).filter((date): date is string => !!date))].sort();
  // Use a compact day grid only while the editable programme fits. Longer
  // itineraries fall back to normal page flow rather than overlapping columns.
  const measuredLine = (text: string, size: number, strong = false) => {
    const f = strong ? bold : font; let current = ''; let count = 1;
    for (const word of clean(text).split(/\s+/)) {
      const trial = current ? `${current} ${word}` : word;
      if (current && f.widthOfTextAtSize(trial, size) > 233) { count++; current = word; } else current = trial;
    }
    return count * size * 1.35 + 1.5;
  };
  const dayHeights = dates.map((date) => {
    const dateLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
    const shirts = kit.filter((k) => k.kitDate === date).map((k) => `${b.teams.find((t) => t.id === k.teamId)?.name ?? 'Team'}: ${k.colourLabel}`);
    return 9 + measuredLine(dateLabel, 15, true) + (shirts.length ? measuredLine('Shirts - ' + shirts.join(' | '), 10, true) : 0)
      + schedule.filter((e) => e.itemDate === date).reduce((height, e) => height
        + measuredLine(`${e.timeLabel ?? 'TBC'}${e.endTimeLabel ? ' - ' + e.endTimeLabel : ''} | ${e.activity}`, 11, true)
        + (e.location ? measuredLine(e.location, 10) : 0) + (e.notes ? measuredLine(e.notes, 10) : 0) + (restaurantMapUrl(e) ? 15 : 0), 0);
  });
  const twoColumns = dates.length === 4 && Math.max(dayHeights[0], dayHeights[1]) + 14 + Math.max(dayHeights[2], dayHeights[3]) < y - 125;
  let rowTop = y; let rowBottom = y;
  for (const [index, date] of dates.entries()) {
    if (twoColumns) {
      if (index % 2 === 0) { rowTop = index === 0 ? y : rowBottom - 14; rowBottom = rowTop; }
      x = index % 2 === 0 ? 52 : 310; textWidth = 233; y = rowTop;
    }
    heading(new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }));
    const shirts = kit.filter((k) => k.kitDate === date).map((k) => `${b.teams.find((t) => t.id === k.teamId)?.name ?? 'Team'}: ${k.colourLabel}`);
    if (shirts.length) line('Shirts - ' + shirts.join(' | '), 10, true);
    for (const e of schedule.filter((e) => e.itemDate === date)) {
      if (y < 125) { page = doc.addPage([595, 842]); y = 784; }
      line(`${e.timeLabel ? e.timeLabel.replace(/^(\d{2}:\d{2}):00$/, '$1') : e.kind === 'accommodation' ? 'Stay' : 'TBC'}${e.endTimeLabel ? ' - ' + e.endTimeLabel : ''} | ${e.activity}`, 11, true);
      if (e.location) line(e.location, 10); if (e.notes) line(e.notes, 10);
      const url = restaurantMapUrl(e); if (url) mapLink(url);
    }
    rowBottom = Math.min(rowBottom, y);
  }
  x = 52; textWidth = 490;
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
  if (b.tour.prizeFund?.rounds.length) {
    heading('Cash prizes');
    for (const prize of b.tour.prizeFund.rounds) {
      const title = prize.title ?? rounds.find((r) => r.roundNumber === prize.roundNumber)?.name ?? 'Competition';
      line(`${title} | ${prize.payoutsPence.map((v, i) => `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} £${v / 100}`).join(' · ')} | per ${prize.paidPer}`, 9.5);
    }
  }
  doc.getPages().forEach((p, i) => { p.drawLine({ start: { x: 52, y: 44 }, end: { x: 543, y: 44 }, thickness: .5, color: muted }); p.drawText(`Roegusta ${b.tour.year} | Portugal local time | ${i + 1} / ${doc.getPageCount()}`, { x: 52, y: 28, size: 8, font, color: muted }); });
  doc.setTitle(b.tour.name + ' - itinerary'); doc.setAuthor('Roegusta Tour'); return doc.save();
}
