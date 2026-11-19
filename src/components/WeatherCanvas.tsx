import { useEffect, useRef } from 'react';
import type { Conditions, WeatherMode } from '../lib/weather';
import { weatherMode } from '../lib/weather';
type Particle = { x: number; y: number; z: number; phase: number };
export default function WeatherCanvas({ weather, demoMode }: { weather: Conditions | null; demoMode?: WeatherMode | 'auto' }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mode = demoMode && demoMode !== 'auto' ? demoMode : weather ? weatherMode(weather.code) : 'clear';
  const isDay = demoMode && demoMode !== 'auto' ? demoMode !== 'storm' : (weather?.isDay ?? true);
  const wind = weather?.wind ?? 9;
  const direction = weather?.windDirection ?? 240;
  const cloudiness = weather?.clouds ?? 20;
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0; let raf = 0; let w = 1; let h = 1; let particles: Particle[] = [];
    const amount = mode === 'rain' || mode === 'storm' ? 135 : mode === 'snow' ? 85 : mode === 'clear' && !isDay ? 75 : 45;
    const create = (): Particle => ({ x: Math.random() * w, y: Math.random() * h, z: 0.35 + Math.random() * 0.95, phase: Math.random() * 6.28 });
    function resize() {
      if (!el) return;
      const rect = el.getBoundingClientRect(); w = rect.width; h = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(w * ratio)); el.height = Math.max(1, Math.round(h * ratio));
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: amount }, create);
      if (reduced.matches) render(true); else render();
    }
    function render(still = false) {
      if (!ctx || !w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(w * .76, h * .24, 1, w * .76, h * .24, w * .68);
      const tint = mode === 'clear' && isDay ? '255,237,195' : mode === 'snow' ? '236,245,255' : '155,187,228';
      glow.addColorStop(0, `rgba(${tint},${mode === 'clear' ? .32 : .12})`); glow.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      const haze = mode === 'cloud' ? .22 + cloudiness / 750 : mode === 'storm' ? .23 : cloudiness / 1400;
      for (let i = 0; i < 3; i++) {
        const x = w * (.13 + i * .38) + Math.sin(frame * .001 + i * 2) * 28;
        const y = h * (.35 + (i % 2) * .2);
        const fog = ctx.createRadialGradient(x, y, 10, x, y, w * .43);
        fog.addColorStop(0, `rgba(220,234,250,${haze})`); fog.addColorStop(1, 'rgba(220,234,250,0)');
        ctx.fillStyle = fog; ctx.fillRect(0, 0, w, h);
      }
      const drift = Math.sin(direction * Math.PI / 180) * Math.min(wind, 65) * .13;
      for (const p of particles) {
        if (mode === 'rain' || mode === 'storm') {
          ctx.strokeStyle = `rgba(222,240,255,${.13 + p.z * .29})`; ctx.lineWidth = p.z * 1.15;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + drift * .8, p.y + 15 * p.z + 9); ctx.stroke();
          if (!still) { p.x += drift * .11; p.y += 4.5 + p.z * 6 + Math.min(wind / 20, 2); }
        } else if (mode === 'snow') {
          ctx.fillStyle = `rgba(255,255,255,${.25 + p.z * .55})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.3 + p.z * 2.3, 0, 6.283); ctx.fill();
          if (!still) { p.x += drift * .055 + Math.sin(frame * .015 + p.phase) * .3; p.y += .6 + p.z * 1.4; }
        } else if (mode === 'clear' && !isDay) {
          const alpha = .28 + .38 * Math.abs(Math.sin(frame * .016 + p.phase));
          ctx.fillStyle = `rgba(236,247,255,${alpha})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.z * 1.4, 0, 6.283); ctx.fill();
        } else if (mode === 'cloud') {
          ctx.fillStyle = `rgba(244,250,255,${.035 + p.z * .04})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 25 * p.z, 7 * p.z, 0, 0, 6.283); ctx.fill();
          if (!still) p.x += .15 + wind * .014;
        } else {
          ctx.fillStyle = `rgba(255,255,255,${.06 + p.z * .08})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.z * 2.2, 0, 6.283); ctx.fill();
          if (!still) p.y -= .06;
        }
        if (p.y > h + 25 || p.x > w + 35 || p.x < -35 || p.y < -35) { p.x = Math.random() * w; p.y = mode === 'rain' || mode === 'snow' ? -20 : Math.random() * h; }
      }
      frame++;
      if (!still && !reduced.matches && !document.hidden) raf = requestAnimationFrame(() => render());
    }
    const observer = new ResizeObserver(resize); observer.observe(el);
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced.matches) render(); };
    const motionChange = () => { cancelAnimationFrame(raf); if (reduced.matches) render(true); else render(); };
    document.addEventListener('visibilitychange', visibility);
    reduced.addEventListener('change', motionChange);
    resize();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motionChange); };
  }, [mode, isDay, wind, direction, cloudiness]);
  return <canvas ref={canvas} className="weather-canvas" aria-hidden="true" />;
}
