import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadTs } from './helpers/load-ts.mjs';

test('weather is scoped to confirmed accommodation on the current tour and switches with it', async () => {
  const endpoint = loadTs('netlify/functions/public-tour-weather.ts', {
    [resolve('netlify/functions/_publicData.ts')]: 'export const getCurrentTour = async db => db.tour; export const withLiveData = (event, read) => read(event.db);',
  });
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(url));
    return { ok: true, json: async () => ({
      timezone: 'Europe/Lisbon', hourly: { time: [1793952000], temperature_2m: [18.1],
        precipitation_probability: [20], precipitation: [0.1], wind_speed_10m: [14], wind_gusts_10m: [28], weather_code: [3], is_day: [1] },
    }) };
  };
  const event = (id, name, saved, placeholder = false) => ({ db: {
    tour: { id },
    from(table) {
      const rows = table === 'tour_itinerary_items' ? [{ id: 'stay', tour_id: id, activity: name, location: name, source_type: 'accommodation', is_placeholder: placeholder, sort_order: 0 }] : [{ state: { weatherLocation: saved } }];
      const query = { select: () => query, eq: (column, value) => { assert.equal(column, 'tour_id'); assert.equal(value, id); return query; }, limit: () => query, then: (ok) => Promise.resolve({ data: rows, error: null }).then(ok) };
      return query;
    },
  } });
  try {
    const known = await endpoint.handler(event('2026', 'Amendoeira Golf Resort'));
    assert.equal(known.status, 'ready');
    assert.equal(known.forecast.hours[0].gust, 28);
    assert.equal(known.forecast.hours[0].isDay, true);
    assert.equal(requests[0].searchParams.get('latitude'), '37.15249');
    assert.equal((await endpoint.handler(event('2026', 'Amendoeira Golf Resort'))).status, 'ready');
    assert.equal(requests.length, 1);
    const next = { name: 'Next Resort', latitude: 40, longitude: -7 };
    const future = await endpoint.handler(event('future', 'Next Resort', next));
    assert.equal(future.location, 'Next Resort');
    assert.equal(requests[1].searchParams.get('latitude'), '40');
    assert.equal((await endpoint.handler(event('future', 'Different Resort', next))).status, 'location_required');
    assert.equal((await endpoint.handler(event('future', 'Amendoeira Golf Resort', next, true))).status, 'unconfirmed');
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = original; }
});
