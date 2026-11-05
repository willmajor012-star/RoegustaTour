import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { fetchPublicTourWeather } from '../lib/publicApi';
import { usePublicData } from '../lib/usePublicData';
import { weatherDescription, type WeatherHour } from '../lib/tourWeather';

const number = (value: number | null, unit: string) => value === null ? '—' : `${value}${unit}`;

function weatherSymbol({ code, isDay }: WeatherHour) {
  if (code === 0 || code === 1) return isDay === false ? '🌙' : '☀️';
  if (code === 2) return isDay === false ? '☁️' : '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code !== null && code >= 95) return '⛈️';
  if (code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return '🌨️';
  if (code !== null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))) return '🌧️';
  return '—';
}

export function Weather() {
  const { data, loading, error, refresh } = usePublicData(fetchPublicTourWeather, { refreshMs: 15 * 60_000 });
  const [selectedDate, setSelectedDate] = useState('');
  const forecast = data?.forecast;
  const timezone = forecast?.timezone;
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' });
  const dayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' });
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short' });
  const dateNumber = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short' });
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const days = new Map<string, WeatherHour[]>();
  for (const hour of forecast?.hours ?? []) {
    const key = dateKey.format(hour.time * 1000);
    const day = days.get(key);
    if (day) day.push(hour); else days.set(key, [hour]);
  }
  const activeDate = days.has(selectedDate) ? selectedDate : dateKey.format(Date.now());
  const activeHours = days.get(activeDate) ?? [...days.values()][0] ?? [];
  return <div className="page-stack weather-page">
    <PageHeader title="Weather" eyebrow={data?.location ?? 'Active tour'} />
    {loading && !data ? <p className="card" role="status">Loading hourly forecast…</p> : null}
    {data?.status === 'unconfirmed' ? <p className="card">The forecast will appear once accommodation is confirmed in the itinerary.</p> : null}
    {data?.status === 'location_required' ? <p className="card">The organiser needs to set the forecast location for the confirmed accommodation.</p> : null}
    {error || data?.status === 'unavailable' ? <div className="card"><p>The forecast is temporarily unavailable.</p><button className="app-action app-action-secondary" type="button" onClick={() => void refresh()}>Try again</button></div> : null}
    {forecast ? <section className="card weather-forecast">
      <div className="section-heading"><h2>Hourly forecast</h2></div>
      <p className="weather-meta">{forecast.stale ? 'Showing the last available forecast · ' : ''}Updated {dayLabel.format(forecast.fetchedAt)} at {clock.format(forecast.fetchedAt)} · local time</p>
      <nav className="public-tabs weather-days" aria-label="Forecast day">{[...days].map(([key, hours]) =>
        <button key={key} type="button" aria-label={dayLabel.format(hours[0].time * 1000)} aria-pressed={hours === activeHours} onClick={() => setSelectedDate(key)}><strong>{weekday.format(hours[0].time * 1000)}</strong><small>{dateNumber.format(hours[0].time * 1000)}</small></button>
      )}</nav>
      <div className="weather-hours" role="table" aria-label="Hourly weather">
        <div className="weather-hour weather-columns" role="row"><span role="columnheader">Time</span><span role="columnheader">Weather</span><span role="columnheader">Rain</span><span role="columnheader">Wind</span></div>
        {activeHours.map((hour) => <div className="weather-hour" key={hour.time} role="row">
          <strong role="cell">{clock.format(hour.time * 1000)}</strong>
          <span role="cell" className="weather-condition"><span className="weather-symbol" aria-hidden="true">{weatherSymbol(hour)}</span><span><strong>{number(hour.temperature, '°C')}</strong><small>{weatherDescription(hour.code)}</small></span></span>
          <span role="cell">{number(hour.rainChance, '%')}<small>{number(hour.rain, ' mm')}</small></span>
          <span role="cell">{number(hour.wind, ' km/h')}<small>Gust {number(hour.gust, ' km/h')}</small></span>
        </div>)}
      </div>
      <p className="weather-meta">Forecast data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>). Resort location: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p>
    </section> : null}
  </div>;
}
