/** Gráficas de líneas (un solo eje, trazo de 2 px, cruceta y tooltip al pasar el ratón). */
import { h } from './dom';
import { dateLabel } from '../sim/util';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
const INK = '#f0efec', INK2 = '#c3c2b7', MUTED = '#898781', GRID = '#2c2c2a', BASE = '#383835', SURFACE = '#1a1a19';

export interface Series { name: string; values: number[]; color?: string; dashed?: boolean }

export interface ChartOpts {
  height?: number;
  xs: number[]; // turnos
  series: Series[];
  fmt?: (v: number) => string;
  zeroLine?: boolean;
  title?: string;
}

function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export function lineChart(opts: ChartOpts): HTMLElement {
  // Sin datos (p. ej. turno 1): una línea discreta en vez de un lienzo vacío que ocupa sitio
  if (opts.xs.length < 2) {
    return h('div', { class: 'chart small muted', style: 'padding:4px 0' }, `${opts.title ?? opts.series.map((x) => x.name).join(' / ')}: `, 'la gráfica aparecerá cuando haya historial (desde el segundo mes).');
  }
  const height = opts.height ?? 150;
  const canvas = h('canvas', { style: `height:${height}px` });
  const tipEl = h('div', { class: 'ctip' });
  const wrap = h('div', { class: 'chart' }, opts.title ? h('div', { class: 'small ink2', style: 'margin-bottom:2px' }, opts.title) : null, canvas, tipEl);
  const fmt = opts.fmt ?? ((v: number) => v.toFixed(1));
  const series = opts.series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length] }));
  if (series.length >= 2) {
    wrap.appendChild(h('div', { class: 'chart-legend' }, series.map((s) => h('span', null, h('i', { style: `background:${s.color}` }), s.name))));
  }
  let hoverIdx = -1;

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    const xs = opts.xs;
    if (xs.length < 2) {
      ctx.fillStyle = MUTED;
      ctx.font = '12px system-ui';
      ctx.fillText('Aún no hay historial suficiente.', 8, height / 2);
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (opts.zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    // Series casi planas: margen mínimo proporcional para no repetir etiquetas («74 74 74»)
    const pad = Math.max((hi - lo) * 0.08, Math.max(Math.abs(hi), Math.abs(lo)) * 0.02) || 1;
    lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi).filter((t, i, a) => i === 0 || fmt(t) !== fmt(a[i - 1]));
    ctx.font = '11px system-ui';
    const labelW = Math.max(...ticks.map((t) => ctx.measureText(fmt(t)).width)) + 8;
    const L = labelW, R = 8, T = 6, B = 18;
    const X = (i: number) => L + ((xs[i] - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - L - R);
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (height - T - B);
    ctx.lineWidth = 1;
    for (const t of ticks) {
      ctx.strokeStyle = t === 0 && opts.zeroLine ? BASE : GRID;
      ctx.beginPath(); ctx.moveTo(L, Math.round(Y(t)) + 0.5); ctx.lineTo(w - R, Math.round(Y(t)) + 0.5); ctx.stroke();
      ctx.fillStyle = MUTED;
      ctx.textAlign = 'right';
      ctx.fillText(fmt(t), L - 4, Y(t) + 4);
    }
    ctx.strokeStyle = BASE;
    ctx.beginPath(); ctx.moveTo(L, height - B + 0.5); ctx.lineTo(w - R, height - B + 0.5); ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(dateLabel(xs[0]).replace(' de ', ' '), L, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel(xs[xs.length - 1]).replace(' de ', ' '), w - R, height - 4);
    for (const s of series) {
      ctx.strokeStyle = s.color!;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.beginPath();
      s.values.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (hoverIdx >= 0 && hoverIdx < xs.length) {
      const x = X(hoverIdx);
      ctx.strokeStyle = INK2;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, T); ctx.lineTo(x + 0.5, height - B); ctx.stroke();
      for (const s of series) {
        const v = s.values[hoverIdx];
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = s.color!;
        ctx.strokeStyle = SURFACE;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, Y(v), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      tipEl.style.display = 'block';
      tipEl.innerHTML = '';
      tipEl.appendChild(h('div', { style: `color:${INK};font-weight:600` }, dateLabel(xs[hoverIdx])));
      for (const s of series) {
        tipEl.appendChild(h('div', null, h('span', { style: `display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:6px` }), `${s.name}: `, h('b', null, fmt(s.values[hoverIdx]))));
      }
      const tw = tipEl.offsetWidth;
      tipEl.style.left = `${Math.min(Math.max(0, x + 10), w - tw)}px`;
      tipEl.style.top = '4px';
    } else tipEl.style.display = 'none';
  };

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const xs = opts.xs;
    if (xs.length < 2) return;
    const w = r.width;
    const L = 40;
    const rel = (e.clientX - r.left - L) / Math.max(1, w - L - 8);
    hoverIdx = Math.max(0, Math.min(xs.length - 1, Math.round(rel * (xs.length - 1))));
    draw();
  });
  canvas.addEventListener('mouseleave', () => { hoverIdx = -1; draw(); });
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);
  requestAnimationFrame(draw);
  return wrap;
}
