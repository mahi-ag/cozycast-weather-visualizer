import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Cloud, CloudRain, Download, Droplets, ExternalLink, Gauge, Layers3, LoaderCircle, LocateFixed, MapPin, Moon, Search, Settings2, Share2, Snowflake, Sun, Thermometer, Wind, X } from 'lucide-react';
import WeatherCanvas from './components/WeatherCanvas';
import { bucket, DEFAULT_CITY, downloadFile, getCities, getCurrent, getHistoric, loadLocal, PALETTES, RANGES, weatherLabel, weatherMode } from './lib/weather';
import type { City, Conditions, Day, WeatherMode } from './lib/weather';
import './App.css';

type Pattern = 'ribbed' | 'woven' | 'smooth';
type View = 'daily' | 'weekly';
const KEY = 'cozycast-atmospheric-v3';
type Saved = { city: City; year: number; palette: number; custom: string[] | null; pattern: Pattern; view: View };
const defaults: Saved = { city: DEFAULT_CITY, year: 2025, palette: 1, custom: null, pattern: 'ribbed', view: 'daily' };
const isColor = (x: unknown): x is string => typeof x === 'string' && /^#[a-fA-F0-9]{6}$/.test(x);
function readState(): Saved {
  const raw = loadLocal<Partial<Saved>>(KEY, {});
  const url = new URLSearchParams(window.location.search);
  const years = new Date().getFullYear() - 1;
  const state = { ...defaults, ...raw };
  if (!Number.isFinite(state.year) || state.year < 1940 || state.year > years) state.year = defaults.year;
  if (!state.city || !Number.isFinite(state.city.latitude) || !Number.isFinite(state.city.longitude)) state.city = DEFAULT_CITY;
  if (!Number.isInteger(state.palette) || state.palette < 0 || state.palette >= PALETTES.length) state.palette = 1;
  if (state.custom?.length !== 7 || !state.custom.every(isColor)) state.custom = null;
  if (!['ribbed', 'woven', 'smooth'].includes(state.pattern)) state.pattern = 'ribbed';
  if (!['daily', 'weekly'].includes(state.view)) state.view = 'daily';
  const lat = Number(url.get('lat')), lon = Number(url.get('lon'));
  if (url.has('lat') && url.has('lon') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) state.city = { name: (url.get('city') || 'Shared location').slice(0, 70), country: (url.get('country') || '').slice(0, 70), latitude: lat, longitude: lon };
  const year = Number(url.get('year')); if (url.has('year') && Number.isInteger(year) && year >= 1940 && year <= years) state.year = year;
  const palette = Number(url.get('palette')); if (url.has('palette') && Number.isInteger(palette) && palette >= 0 && palette < PALETTES.length) state.palette = palette;
  const colors = url.get('colors')?.split(','); if (colors?.length === 7 && colors.every(isColor)) state.custom = colors;
  const pattern = url.get('pattern'); if (pattern === 'ribbed' || pattern === 'woven' || pattern === 'smooth') state.pattern = pattern;
  const view = url.get('view'); if (view === 'daily' || view === 'weekly') state.view = view;
  return state;
}
function dateLabel(date: string) { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function exportSvg(days: Day[], colors: string[], city: string, year: number, pattern: Pattern, view: View) {
  const width = 1160; const height = 700; const rows = days.length; const step = height / Math.max(rows, 1);
  const stripes = days.map((d, i) => {
    const y = i * step;
    return `<rect x="0" y="${y.toFixed(3)}" width="${width}" height="${(step + .5).toFixed(3)}" fill="${colors[bucket(d.temp)]}"/>`;
  }).join('');
  const texture = pattern === 'smooth' ? '' : `<defs><pattern id="weave" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q3 0 6 4 T12 4" fill="none" stroke="#fff" stroke-opacity="${pattern === 'ribbed' ? '.25' : '.17'}" stroke-width="1.7"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#weave)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><title>${city} ${year} ${view} weather textile</title>${stripes}${texture}</svg>`;
  downloadFile(`cozycast-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}.svg`, svg, 'image/svg+xml');
}
function App() {
  const [initial] = useState(readState);
  const [city, setCity] = useState(initial.city);
  const [year, setYear] = useState(initial.year);
  const [palette, setPalette] = useState(initial.palette);
  const [custom, setCustom] = useState<string[] | null>(initial.custom);
  const [pattern, setPattern] = useState<Pattern>(initial.pattern);
  const [view, setView] = useState<View>(initial.view);
  const [days, setDays] = useState<Day[]>([]);
  const [current, setCurrent] = useState<Conditions | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<City[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<WeatherMode | 'auto'>('auto');
  const [selected, setSelected] = useState<Day | null>(null);
  const [notice, setNotice] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const colors = custom ?? PALETTES[palette].colors;
  const latestYear = new Date().getFullYear() - 1;
  const years = Array.from({ length: Math.min(16, latestYear - 1939) }, (_, i) => latestYear - i);
  const scene: WeatherMode = demoMode !== 'auto' ? demoMode : weatherMode(current?.code ?? 0);
  const night = demoMode === 'auto' && current ? !current.isDay : false;
  const ambient = scene === 'rain' || scene === 'storm' ? 'rain' : scene === 'snow' ? 'snow' : scene === 'cloud' ? 'cloud' : night ? 'night' : 'clear';
  const skyLabel = demoMode === 'auto' ? current ? weatherLabel(current.code) : 'Atmospheric conditions' : `${demoMode.charAt(0).toUpperCase()}${demoMode.slice(1)} preview`;

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ city, year, palette, custom, pattern, view })); } catch { /* storage may be disabled */ } }, [city, year, palette, custom, pattern, view]);
  useEffect(() => { const control = new AbortController(); setHistoryLoading(true); setHistoryError(''); setDays([]); setSelected(null);
    getHistoric(city, year, control.signal).then(setDays).catch(e => { if (!control.signal.aborted) setHistoryError(e instanceof Error ? e.message : 'Historical data unavailable'); }).finally(() => { if (!control.signal.aborted) setHistoryLoading(false); });
    return () => control.abort(); }, [city, year]);
  useEffect(() => { const control = new AbortController(); setLiveLoading(true); setCurrentError(''); setCurrent(null);
    getCurrent(city, control.signal).then(setCurrent).catch(() => { if (!control.signal.aborted) setCurrentError('Live conditions unavailable'); }).finally(() => { if (!control.signal.aborted) setLiveLoading(false); });
    return () => control.abort(); }, [city]);
  useEffect(() => { if (query.trim().length < 2) { setMatches([]); setSearchLoading(false); return; }
    const control = new AbortController(); const timer = window.setTimeout(() => { setSearchLoading(true);
      getCities(query.trim(), control.signal).then(setMatches).catch(() => { if (!control.signal.aborted) setMatches([]); }).finally(() => { if (!control.signal.aborted) setSearchLoading(false); }); }, 300);
    return () => { window.clearTimeout(timer); control.abort(); }; }, [query]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const aggregated = useMemo(() => {
    if (view === 'daily') return days;
    const weeks: Day[] = [];
    for (let i = 0; i < days.length; i += 7) { const slice = days.slice(i, i + 7); weeks.push({ date: slice[0].date, temp: slice.reduce((v, d) => v + d.temp, 0) / slice.length }); }
    return weeks;
  }, [days, view]);
  const stats = useMemo(() => { if (!days.length) return null; const avg = days.reduce((v, d) => v + d.temp, 0) / days.length; const hot = days.reduce((a, b) => a.temp > b.temp ? a : b); const cold = days.reduce((a, b) => a.temp < b.temp ? a : b); return { avg, hot, cold, colorsUsed: new Set(days.map(d => bucket(d.temp))).size }; }, [days]);
  function toast(text: string) { setNotice(text); window.setTimeout(() => setNotice(''), 3300); }
  function selectCity(c: City) { setCity(c); setQuery(''); setMatches([]); setSearchOpen(false); setDemoMode('auto'); }
  function locate() { if (!navigator.geolocation) { toast('Geolocation is not supported. Try city search.'); return; }
    navigator.geolocation.getCurrentPosition(async pos => { try { const { latitude, longitude } = pos.coords; setCity({ name: 'My location', country: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`, latitude, longitude }); setQuery(''); setSearchOpen(false); setDemoMode('auto');
    } catch { toast('Could not use current location'); } }, () => toast('Location permission denied. Search for a city instead.'), { timeout: 12000, maximumAge: 300000 }); }
  function share() { const p = new URLSearchParams({ lat: String(city.latitude), lon: String(city.longitude), city: city.name, country: city.country, year: String(year), palette: String(palette), colors: colors.join(','), pattern, view });
    const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`; window.history.replaceState(null, '', url);
    navigator.clipboard?.writeText(url).then(() => toast('Share link copied')).catch(() => toast('Your link is ready in the address bar'));
    if (!navigator.clipboard) toast('Your link is ready in the address bar'); }
  function downloadCsv() { if (!days.length) return; downloadFile(`cozycast-${year}-temperatures.csv`, `date,mean_temperature_c,yarn_color\n${days.map(d => `${d.date},${d.temp.toFixed(1)},${colors[bucket(d.temp)]}`).join('\n')}`, 'text/csv;charset=utf-8'); toast('CSV downloaded'); }
  const Icon = scene === 'snow' ? Snowflake : scene === 'rain' || scene === 'storm' ? CloudRain : scene === 'cloud' ? Cloud : night ? Moon : Sun;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="CozyCast home"><span className="brand-mark"><Layers3 size={21} strokeWidth={1.8}/></span><span>cozycast<span className="brand-period">.</span></span></a><nav className="desktop-nav" aria-label="Main navigation"><a className="active" href="#studio">Studio</a><a href="#how-it-works">How it works</a><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Data source <ExternalLink size={12}/></a></nav><span className="header-tag"><span className="status-dot"/> WEATHER, REIMAGINED</span></header>
    <main id="top">
      <section className={`sky-panel sky-${ambient}`} aria-label="Live atmospheric weather conditions">
        <WeatherCanvas weather={current} demoMode={demoMode}/>
        <div className="sky-vignette"/>
        <div className="sky-topline"><div className="sky-eyebrow"><span className="live-pip"/> LIVE ATMOSPHERE <span className="muted-sep">/</span> {city.name.toUpperCase()}</div><div className="scene-controls" aria-label="Weather animation preview"><span className="scene-caption">SCENE</span><select aria-label="Preview atmospheric scene" value={demoMode} onChange={e => setDemoMode(e.target.value as WeatherMode | 'auto')}><option value="auto">Live weather</option><option value="clear">Clear</option><option value="cloud">Clouds</option><option value="rain">Rain</option><option value="snow">Snow</option><option value="storm">Storm</option></select><ChevronDown size={13}/></div></div>
        <div className="sky-content"><div className="sky-overline">AN INTERACTIVE WEATHER STUDIO</div><h1>Every forecast<br/><em>tells a story.</em></h1><p>Turn a year of temperatures into a textile artwork — shaped by the weather, made yours.</p><a href="#studio" className="hero-cta">Explore the studio <ArrowDown size={16}/></a></div>
        <div className="weather-glass"><div className="weather-summary"><Icon size={29} strokeWidth={1.35}/><div><div className="weather-place">{city.name}, {city.country}</div><div className="weather-desc">{skyLabel}</div></div></div><div className="temperature">{liveLoading ? '—' : current ? `${Math.round(current.temperature)}°` : '—'}</div><div className="weather-glass-divider"/><div className="weather-metrics"><span><Wind size={14}/> {current ? `${Math.round(current.wind)} km/h` : '—'}</span><span><Droplets size={14}/> {current ? `${Math.round(current.humidity)}%` : '—'}</span><span><Cloud size={14}/> {current ? `${Math.round(current.clouds)}%` : '—'}</span></div>{currentError && <div className="inline-data-error">{currentError}</div>}</div>
        <div className="sky-bottom"><span>01 — ATMOSPHERE</span><span>RENDERED IN REAL TIME <span className="small-spark">✳</span></span></div>
      </section>
      <section className="studio-section" id="studio"><div className="section-intro"><div><div className="eyebrow dark-eyebrow"><span className="eyebrow-line"/> THE TEXTILE STUDIO</div><h2>Weather into <span>something tangible.</span></h2><p>One day, one stripe, one memory. Design a visual keepsake from a year's climate.</p></div><div className="intro-number">02 <span>/ 03</span></div></div>
      <div className="studio-grid">
        <aside className="control-column"><div className="control-heading"><Settings2 size={17}/> YOUR CANVAS <span>01 — 03</span></div>
          <div className="control-card"><div className="control-label"><span className="step-index">01</span><span>Choose a location</span></div><div className="city-picker" ref={searchRef}><Search size={18}/><input aria-label="Search city" placeholder={`${city.name}, ${city.country}`} value={query} onFocus={() => setSearchOpen(true)} onChange={e => { setQuery(e.target.value); setSearchOpen(true); }} /><button title="Use my location" aria-label="Use my location" onClick={locate}><LocateFixed size={17}/></button>{searchOpen && query.trim().length >= 2 && <div className="city-results" role="listbox">{searchLoading && <div className="search-message"><LoaderCircle className="spin" size={15}/> Searching places…</div>}{!searchLoading && !matches.length && <div className="search-message">No results. Try another city.</div>}{matches.map((c,i) => <button key={`${c.name}-${c.latitude}-${i}`} onClick={() => selectCity(c)}><MapPin size={14}/><span>{c.name}<small>{c.country}</small></span></button>)}</div>}</div><div className="selection-hint"><MapPin size={12}/> {city.name}, {city.country}</div></div>
          <div className="control-card"><div className="control-label"><span className="step-index">02</span><span>Select a year</span></div><div className="field-wrap"><select value={year} aria-label="Historical weather year" onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option value={y} key={y}>{y}</option>)}</select><ChevronDown size={16}/></div><div className="field-footnote">365 or 366 days of recorded temperatures</div></div>
          <div className="control-card"><div className="control-label"><span className="step-index">03</span><span>Choose your palette</span></div><div className="palettes">{PALETTES.map((p,i) => <button className={`palette-choice ${palette === i && !custom ? 'chosen' : ''}`} key={p.name} onClick={() => { setPalette(i); setCustom(null); }} aria-pressed={palette === i && !custom}><span className="palette-swatches">{p.colors.map((c,j) => <i style={{background:c}} key={j}/>)}</span><span>{p.name}</span>{palette === i && !custom && <Check size={14}/>}</button>)}</div><button className={`edit-palette ${showCustom ? 'editing' : ''}`} onClick={() => setShowCustom(s => !s)}><Settings2 size={14}/> Edit individual yarn colors <ChevronDown size={14}/></button>{showCustom && <div className="custom-colors">{colors.map((c,i) => <label key={i} title={RANGES[i]}><input type="color" value={c} onChange={e => { const next = [...colors]; next[i] = e.target.value; setCustom(next); }}/><small>{RANGES[i]}</small></label>)}</div>}</div>
          <div className="control-card control-minimal"><div className="control-label"><span className="step-index">04</span><span>Texture & detail</span></div><div className="segmented" role="group" aria-label="Textile texture">{(['ribbed', 'woven', 'smooth'] as Pattern[]).map(p => <button key={p} className={pattern===p?'selected':''} onClick={() => setPattern(p)} aria-pressed={pattern===p}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>)}</div><div className="field-footnote">Styling changes the textile preview, not the data.</div></div>
        </aside>
        <div className="preview-column"><div className="preview-header"><div><span className="tiny-label">YOUR GENERATIVE TEXTILE</span><h3>{city.name} <span>·</span> {year}</h3></div><div className="view-toggle" role="group" aria-label="Temperature aggregation"><button className={view==='daily'?'active':''} onClick={() => { setView('daily'); setSelected(null); }}>Daily</button><button className={view==='weekly'?'active':''} onClick={() => { setView('weekly'); setSelected(null); }}>Weekly</button></div></div>
          <div className="blanket-frame"><div className="frame-index">FIG. 01 <span>— TEMPERATURE STUDY</span></div>{historyLoading ? <div className="preview-loading"><LoaderCircle size={26} className="spin"/><strong>Weaving the weather</strong><span>Retrieving historical temperatures…</span></div> : historyError ? <div className="preview-loading preview-error"><Cloud size={28}/><strong>Couldn't load this year</strong><span>{historyError}</span><button onClick={() => setYear(2025)}>Return to 2025 <ArrowRight size={14}/></button></div> : <div className={`textile textile-${pattern}`} role="img" aria-label={`${view} temperature stripes for ${city.name} during ${year}`}>
            {aggregated.map((d,i) => <button key={`${d.date}-${i}`} style={{backgroundColor:colors[bucket(d.temp)]}} title={`${dateLabel(d.date)} · ${d.temp.toFixed(1)}°C`} aria-label={`${dateLabel(d.date)}, ${d.temp.toFixed(1)} degrees Celsius`} className={selected?.date === d.date ? 'textile-row focused' : 'textile-row'} onMouseEnter={() => setSelected(d)} onFocus={() => setSelected(d)} onClick={() => setSelected(d)}/>)}<div className="textile-light"/></div>}
            <div className="frame-footer"><span>TOP · JANUARY</span><span>{aggregated.length} {view === 'daily' ? 'DAILY STRIPES' : 'WEEKLY STRIPES'}</span><span>BOTTOM · DECEMBER</span></div></div>
          <div className="selected-day">{selected && days.length ? <><span className="selected-dot" style={{backgroundColor:colors[bucket(selected.temp)]}}/><strong>{dateLabel(selected.date)}</strong><span>{selected.temp.toFixed(1)}°C mean temperature</span><button onClick={() => setSelected(null)} aria-label="Clear selected day"><X size={14}/></button></> : <><span className="selected-dot neutral"/><span>Hover over the textile to explore individual {view === 'daily' ? 'days' : 'weeks'}.</span></>}</div>
          <div className="legend"><div className="legend-title"><span>TEMPERATURE → COLOR</span><span>°C</span></div><div className="legend-items">{colors.map((c,i) => <div className="legend-item" key={i}><span style={{backgroundColor:c}}/><small>{RANGES[i]}</small></div>)}</div></div>
          <div className="export-actions"><button className="primary-action" disabled={!days.length} onClick={() => { exportSvg(aggregated, colors, city.name, year, pattern, view); toast('SVG textile downloaded'); }}><Download size={17}/> Export textile <ArrowRight size={16}/></button><button disabled={!days.length} className="secondary-action" onClick={downloadCsv}><Layers3 size={16}/> Download data</button><button className="icon-action" onClick={share} title="Copy shareable configuration link" aria-label="Share design"><Share2 size={17}/></button></div>
        </div>
        <aside className="insight-column"><div className="insight-top"><span className="tiny-label">A YEAR IN NUMBERS</span><span className="insight-mark"><Gauge size={16}/></span></div><div className="insight-main"><span>Average temperature</span><strong>{stats ? `${stats.avg.toFixed(1)}°` : '—'}</strong><span className="unit-caption">CELSIUS / ANNUAL MEAN</span></div><div className="insight-divider"/><div className="mini-stat"><span><Sun size={17}/> Warmest day</span><strong>{stats ? `${stats.hot.temp.toFixed(1)}°C` : '—'}</strong><small>{stats ? dateLabel(stats.hot.date) : '—'}</small></div><div className="mini-stat"><span><Snowflake size={17}/> Coldest day</span><strong>{stats ? `${stats.cold.temp.toFixed(1)}°C` : '—'}</strong><small>{stats ? dateLabel(stats.cold.date) : '—'}</small></div><div className="mini-stat"><span><Thermometer size={17}/> Colors in use</span><strong>{stats ? String(stats.colorsUsed).padStart(2, '0') : '—'}</strong><small>out of 7 temperature bands</small></div><div className="insight-quote">“A landscape of moments, translated into color.”<span>— YOUR WEATHER ARCHIVE</span></div></aside>
      </div></section>
      <section className="how-section" id="how-it-works"><div><span className="eyebrow dark-eyebrow">THE PROCESS / 03</span><h2>From data to design.</h2></div><div className="how-steps"><article><span>01 / FETCH</span><h4>Find your place.</h4><p>We retrieve historical daily mean temperatures from Open-Meteo for the location and year you choose.</p></article><article><span>02 / TRANSLATE</span><h4>Make it visual.</h4><p>Each day's temperature is assigned to one of seven yarn colors. Daily and weekly modes reshape the composition.</p></article><article><span>03 / KEEP</span><h4>Make it yours.</h4><p>Customize texture and palette, export a scalable textile design, or share your configuration as a link.</p></article></div></section>
    </main>
    <footer><div className="footer-brand"><Layers3 size={17}/> cozycast<span>.</span></div><span>CRAFTED FROM CLIMATE DATA. DESIGNED FOR CURIOSITY.</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo <ExternalLink size={12}/></a></footer>
    {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={13}/></button></div>}
  </div>;
}
export default App;
