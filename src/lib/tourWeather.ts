export type WeatherLocation = { name: string; latitude: number; longitude: number };
export type WeatherHour = { time: number; temperature: number | null; rainChance: number | null; rain: number | null; wind: number | null; gust: number | null; code: number | null; isDay?: boolean };
export type TourWeather = { location?: string; status: 'ready' | 'unconfirmed' | 'location_required' | 'unavailable'; forecast?: { timezone: string; fetchedAt: number; hours: WeatherHour[]; stale?: boolean } };

export function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (!value || typeof value !== 'object') return false;
  const { name, latitude, longitude } = value as Partial<WeatherLocation>;
  return typeof name === 'string' && !!name.trim() && name.length <= 200
    && typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

export function weatherDescription(code: number | null) {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code !== null && code >= 51 && code <= 57) return 'Drizzle';
  if (code !== null && code >= 61 && code <= 67) return 'Rain';
  if (code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return 'Snow';
  if (code !== null && code >= 80 && code <= 82) return 'Showers';
  if (code !== null && code >= 95) return 'Thunderstorms';
  return 'Conditions unavailable';
}
