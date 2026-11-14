// Live 14-day forecast from Open-Meteo (free, no API key). Falls back to sample weather offline.
// Also returns the recent norm: the average daily high over the last 4 weeks. The forecast compares
// each day to that norm, because the typical-day totals and the hourly shape already reflect recent weeks.
import { iso } from "./model.js";

const SAMPLE_TEMPS = [52, 48, 44, 46, 51, 55, 49, 41, 38, 43, 47, 45, 40, 36];
const SAMPLE_CODES = [2, 3, 61, 3, 0, 0, 2, 61, 3, 0, 2, 85, 3, 0];
const SAMPLE_NORM = 58;   // sample recent norm (°F), used offline only
const NORM_DAYS = 28;

export function describe(code) {
  if (code === 0) return "Sunny";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

const wet = code => code >= 51;

function sample(start) {
  return SAMPLE_TEMPS.map((t, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: d, key: iso(d), temp: t, norm: SAMPLE_NORM, cond: describe(SAMPLE_CODES[i]), rain: wet(SAMPLE_CODES[i]) };
  });
}

export async function getWeather(start, { lat, lon }) {
  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,weather_code` +
    `&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=14&past_days=${NORM_DAYS}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const all = data.daily.time.map((t, i) => {
      const [y, m, d] = t.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const code = data.daily.weather_code[i];
      return { date, key: t, temp: Math.round(data.daily.temperature_2m_max[i]), cond: describe(code), rain: wet(code) };
    });
    const first = iso(start);
    const days = all.filter(d => d.key >= first);
    const past = all.filter((d, i) => d.key < first && data.daily.temperature_2m_max[i] != null);
    if (!days.length) throw new Error("no forecast days");
    const norm = past.length ? Math.round(past.reduce((a, d) => a + d.temp, 0) / past.length) : days[0].temp;
    days.forEach(d => { d.norm = norm; });
    return { days, live: true, norm };
  } catch {
    return { days: sample(start), live: false, norm: SAMPLE_NORM };
  }
}
