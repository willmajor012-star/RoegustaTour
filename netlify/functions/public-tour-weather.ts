import { getCurrentTour, withLiveData } from './_publicData';
import { runRows } from './_adminSupabase';
import { mapTourItineraryItem } from './_mappers';
import type { PublicAccessEvent } from './_publicAccess';
import { manualItineraryKind } from '../../src/lib/tourItinerary';
import { isWeatherLocation, type TourWeather, type WeatherHour, type WeatherLocation } from '../../src/lib/tourWeather';

type Forecast = NonNullable<TourWeather['forecast']>;
const cache = new Map<string, Forecast>();
const pending = new Map<string, Promise<Forecast>>();
const fields = ['temperature_2m', 'precipitation_probability', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'weather_code', 'is_day'] as const;
const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function resolveAccommodationWeather(names: string[], saved: unknown): WeatherLocation | undefined {
  if (isWeatherLocation(saved) && names.some((name) => normalise(name) === normalise(saved.name))) return saved;
  // Verified OpenStreetMap resort centre (way 252062729). Reuse only when the
  // active itinerary confirms this exact accommodation, never by tour year.
  if (names.length === 1 && normalise(names[0]) === 'amendoeira golf resort') {
    return { name: names[0], latitude: 37.15249, longitude: -8.35510 };
  }
}

async function fetchForecast(location: WeatherLocation): Promise<Forecast> {
  const key = location.latitude + ',' + location.longitude;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < 15 * 60_000) return cached;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    try {
      const query = new URLSearchParams({
        latitude: String(location.latitude), longitude: String(location.longitude),
        hourly: fields.join(','), timezone: 'auto', timeformat: 'unixtime',
        forecast_days: '7', temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm',
      });
      const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Weather provider unavailable');
      const data = await response.json() as { timezone?: string; hourly?: Record<string, unknown[]> };
      const hourly = data.hourly;
      if (!data.timezone || !Array.isArray(hourly?.time) || !hourly.time.length ||
        !fields.every((f) => Array.isArray(hourly[f]) && hourly[f].length === hourly.time.length)) throw new Error('Incomplete hourly forecast');
      new Intl.DateTimeFormat('en-GB', { timeZone: data.timezone });
      const read = (f: typeof fields[number], i: number) => typeof hourly[f][i] === 'number' && Number.isFinite(hourly[f][i]) ? hourly[f][i] as number : null;
      const hours: WeatherHour[] = hourly.time.flatMap((time, i) => typeof time === 'number' && Number.isFinite(time) ? [{
        time, temperature: read('temperature_2m', i), rainChance: read('precipitation_probability', i),
        rain: read('precipitation', i), wind: read('wind_speed_10m', i), gust: read('wind_gusts_10m', i), code: read('weather_code', i),
        isDay: read('is_day', i) === null ? undefined : read('is_day', i) === 1,
      }] : []);
      if (!hours.length) throw new Error('Hourly forecast is empty');
      const forecast = { timezone: data.timezone, fetchedAt: Date.now(), hours };
      if (cache.size >= 20) cache.clear();
      cache.set(key, forecast);
      return forecast;
    } catch (error) {
      if (cached && Date.now() - cached.fetchedAt < 6 * 3_600_000) return { ...cached, stale: true };
      throw error;
    }
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}

export const handler = (event: PublicAccessEvent) => withLiveData(event, async (db): Promise<TourWeather> => {
  const tour = await getCurrentTour(db);
  if (!tour) return { status: 'unconfirmed' };
  const [items, operations] = await Promise.all([
    runRows(db.from('tour_itinerary_items').select('*').eq('tour_id', tour.id), 'forecast accommodation'),
    runRows<{ state?: { weatherLocation?: unknown } }>(db.from('tour_operations').select('state').eq('tour_id', tour.id).limit(1), 'forecast location'),
  ]);
  const names = [...new Set(items.map(mapTourItineraryItem)
    .filter((i) => !i.isPlaceholder && manualItineraryKind(i) === 'accommodation')
    .map((i) => (i.location || i.activity).trim()).filter(Boolean))];
  if (!names.length) return { status: 'unconfirmed' };
  const location = resolveAccommodationWeather(names, operations[0]?.state?.weatherLocation);
  if (!location) return { status: 'location_required', location: names.length === 1 ? names[0] : undefined };
  try {
    return { status: 'ready', location: location.name, forecast: await fetchForecast(location) };
  } catch {
    return { status: 'unavailable', location: location.name };
  }
});
