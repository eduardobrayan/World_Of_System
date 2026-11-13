/** Piezas reutilizables de la interfaz. */
import type { Country, Snapshot } from '../sim/types';
import { h } from './dom';
import { IND } from './info';
import { indicatorTip, tip } from './tooltip';
import { lineChart } from './charts';
import type { App } from './app';
import { perceived, approxMark } from './perceive';

/** Valor de un indicador (con incertidumbre si el país no es el del jugador). */
export function indValue(app: App, key: string, c: Country): string {
  const ind = IND[key];
  const raw = ind.get(c, app.world);
  const v = ind.noisy ? perceived({ world: app.world, player: app.player }, c, key, raw) : raw;
  return (ind.noisy ? approxMark(app.world, app.player, c) : '') + ind.fmt(v);
}

export function kpi(app: App, key: string, c: Country, delta?: number): HTMLElement {
  const ind = IND[key];
  const el = h('div', { class: 'kpi' }, h('div', { class: 'k' }, ind.name),
    h('div', { class: 'v' }, indValue(app, key, c), delta !== undefined && Math.abs(delta) > 0.005
      ? h('span', { class: `small ${(delta > 0) === (ind.better !== 'down') ? 'good' : 'bad'}`, style: 'margin-left:4px;font-weight:500' }, `${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(1)}`)
      : null));
  return tip(el, indicatorTip(key, () => c, () => app.world, () => indValue(app, key, c)));
}

export function stat(app: App, key: string, c: Country, label?: string): HTMLElement {
  const ind = IND[key];
  const el = h('div', { class: 'stat' }, h('span', { class: 'k' }, label ?? ind.name), h('span', { class: 'v' }, indValue(app, key, c)));
  return tip(el, indicatorTip(key, () => c, () => app.world, () => indValue(app, key, c)));
}

export function plainStat(label: string, value: string | HTMLElement, tipText?: string): HTMLElement {
  const el = h('div', { class: 'stat' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
  if (tipText) tip(el, () => tipText);
  return el;
}

export function bar(v: number, max = 100, color?: string): HTMLElement {
  return h('div', { class: 'bar' }, h('i', { style: `width:${Math.max(0, Math.min(100, (v / max) * 100))}%;${color ? `background:${color}` : ''}` }));
}

/** Gráfica histórica de una o varias variables de Snapshot. */
export function histChart(c: Country, keys: (keyof Snapshot)[], names: string[], fmt?: (v: number) => string, height = 140, zero = false): HTMLElement {
  const hist = c.history.filter((s) => keys.every((k) => typeof s[k] === 'number'));
  return lineChart({
    xs: hist.map((s) => s.t),
    series: keys.map((k, i) => ({ name: names[i], values: hist.map((s) => s[k] as number) })),
    fmt, height, zeroLine: zero,
  });
}

export function section(title: string, ...children: (HTMLElement | null | false | string)[]): HTMLElement {
  return h('div', { class: 'card' }, h('h3', null, title), ...children);
}

export function delta(c: Country, key: keyof Snapshot, back = 12): number | undefined {
  const hist = c.history;
  if (hist.length < 2) return undefined;
  const last = hist[hist.length - 1];
  const prev = [...hist].reverse().find((s) => s.t <= last.t - back) ?? hist[0];
  return (last[key] as number) - (prev[key] as number);
}

/** Selector entero con botones − / + (sin deslizadores). */
export function intStepper(label: string, desc: string, value: number, min: number, max: number, onChange: (v: number) => void, fmt: (v: number) => string = (v) => String(v)): HTMLElement {
  let v = value;
  const valEl = h('span', { class: 'val' }, fmt(v));
  const set = (nv: number) => {
    nv = Math.max(min, Math.min(max, nv));
    if (nv === v) return;
    v = nv;
    valEl.textContent = fmt(v);
    onChange(v);
  };
  const lab = h('label', { title: desc }, label);
  return h('div', { class: 'step-row int' }, lab,
    h('div', { class: 'stepper' },
      h('button', { class: 'step', 'aria-label': `Bajar ${label}`, onclick: () => set(v - 1) }, '−'),
      valEl,
      h('button', { class: 'step', 'aria-label': `Subir ${label}`, onclick: () => set(v + 1) }, '+')));
}

/** Barra de una necesidad o índice con su referencia (marca vertical). */
export function refBar(v: number, ref: number, color?: string): HTMLElement {
  const el = bar(v, 100, color);
  el.style.position = 'relative';
  el.append(h('b', { class: 'bar-ref', style: `left:${Math.max(0, Math.min(100, ref))}%`, title: `Nivel habitual: ${ref.toFixed(0)}` }));
  return el;
}
