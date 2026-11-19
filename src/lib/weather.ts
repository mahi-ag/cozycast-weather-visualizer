export type City = { name: string; country: string; latitude: number; longitude: number };
export type Day = { date: string; temp: number };
export type Conditions = { temperature: number; apparent: number; humidity: number; wind: number; windDirection: number; clouds: number; precipitation: number; snowfall: number; code: number; isDay: boolean; uv: number | null; time: string };
export type WeatherMode = 'clear' | 'cloud' | 'rain' | 'snow' | 'storm';
export const DEFAULT_CITY: City = { name: 'New Delhi', country: 'India', latitude: 28.6139, longitude: 77.209 };
export const PALETTES = [
  { name: 'Nordic', colors: ['#42577b', '#6887a2', '#9ab5c4', '#b8b6b0', '#d7b7a0', '#b98987', '#895b70'] },
  { name: 'Solstice', colors: ['#3c5f85', '#6b9ebc', '#b1c7c0', '#e4d8bf', '#e7b991', '#d68d73', '#a85f68'] },
  { name: 'Monochrome', colors: ['#343945', '#606c78', '#909ca5', '#bac1c6', '#d0c6bd', '#a89b91', '#6b6262'] },
  { name: 'Botanical', colors: ['#3e5965', '#698b86', '#a0b8a1', '#ccd1ab', '#e4cb9e', '#cda589', '#a87871'] },
];
export const THRESHOLDS = [0, 5, 10, 15, 20, 25];
export function bucket(temp: number) { const i = THRESHOLDS.findIndex(t => temp < t); return i < 0 ? THRESHOLDS.length : i; }
export const RANGES = ['Below 0°', '0–4°', '5–9°', '10–14°', '15–19°', '20–24°', '25°+'];
export function weatherMode(code: number): WeatherMode {
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([1, 2, 3, 45, 48].includes(code)) return 'cloud';
  return 'clear';
}
export function weatherLabel(code: number) {
  const mode = weatherMode(code);
  if (mode === 'storm') return 'Thunderstorms';
  if (mode === 'snow') return 'Snowfall';
  if (mode === 'rain') return 'Rain showers';
  if (mode === 'cloud') return code === 3 ? 'Overcast' : 'Partly cloudy';
  return 'Clear sky';
}
export async function getCities(query: string, signal: AbortSignal): Promise<City[]> {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const r = await fetch(u, { signal }); if (!r.ok) throw new Error('Location lookup failed');
  const j = await r.json();
  return (j.results ?? []).map((x: City) => ({ name: x.name, country: x.country, latitude: x.latitude, longitude: x.longitude }));
}
export async function getHistoric(city: City, year: number, signal: AbortSignal): Promise<Day[]> {
  const u = new URL('https://archive-api.open-meteo.com/v1/archive');
  u.search = new URLSearchParams({ latitude: String(city.latitude), longitude: String(city.longitude), start_date: `${year}-01-01`, end_date: `${year}-12-31`, daily: 'temperature_2m_mean', timezone: 'auto' }).toString();
  const r = await fetch(u, { signal }); if (!r.ok) throw new Error('Historical weather could not be loaded.');
  const j = await r.json();
  const dates: string[] = j.daily?.time ?? []; const values: (number | null)[] = j.daily?.temperature_2m_mean ?? [];
  const days = dates.flatMap((date, i) => typeof values[i] === 'number' && Number.isFinite(values[i]) ? [{ date, temp: values[i] as number }] : []);
  if (!days.length) throw new Error('No temperature records were available for that year.');
  return days;
}
export async function getCurrent(city: City, signal: AbortSignal): Promise<Conditions> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({ latitude: String(city.latitude), longitude: String(city.longitude), current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,cloud_cover,precipitation,snowfall,wind_speed_10m,wind_direction_10m', hourly: 'uv_index', forecast_days: '1', timezone: 'auto' }).toString();
  const r = await fetch(u, { signal }); if (!r.ok) throw new Error('Live weather unavailable');
  const j = await r.json(); const c = j.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('Current conditions missing');
  const hourlyTimes: string[] = j.hourly?.time ?? [];
  const hour = String(c.time).slice(0, 13);
  const idx = hourlyTimes.findIndex(t => t.startsWith(hour));
  const uv = idx >= 0 && typeof j.hourly?.uv_index?.[idx] === 'number' ? j.hourly.uv_index[idx] as number : null;
  return { temperature: c.temperature_2m, apparent: c.apparent_temperature, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m, windDirection: c.wind_direction_10m, clouds: c.cloud_cover, precipitation: c.precipitation, snowfall: c.snowfall, code: c.weather_code, isDay: c.is_day === 1, uv, time: c.time };
}
export function loadLocal<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } }
export function downloadFile(filename: string, contents: string, type: string) { const blob = new Blob([contents], { type }); const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(u), 1500); }
