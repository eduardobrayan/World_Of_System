/** Barra superior mínima: bandera, fecha con pausa/velocidad, 4 cifras con icono y capital político. */
import type { App } from '../app';
import { h } from '../dom';
import { flagEl } from '../flags';
import { IND } from '../info';
import { indicatorTip, tip } from '../tooltip';
import { dateLabel } from '../../sim/util';
import { delta } from '../components';
import { openGameMenu } from '../menu';
import { tweenNumber } from '../live';
import { gauges, scoreColor } from './command';
import { openGoal } from '../hub';
import type { Snapshot } from '../../sim/types';

const KEYS: [string, keyof Snapshot | null, string][] = [
  ['gdp', 'gdp', '💰'], ['growth', 'growth', '📈'], ['inflation', 'inflation', '🏷️'], ['unemployment', 'unemployment', '🔧'], ['debt', 'debt', '🏦'],
  ['deficit', 'deficit', '💸'], ['reserves', 'reserves', '🪙'], ['approval', 'approval', '👍'], ['stability', 'stability', '🏛️'],
];
const SIMPLE = ['gdp', 'growth', 'inflation', 'approval'];
const SHORT: Record<string, string> = { gdp: 'PIB', growth: 'Crecimiento', inflation: 'Inflación', approval: 'Aprobación' };

export function renderTopbar(app: App): HTMLElement[] {
  const w = app.world;
  const p = app.player;
  const out: HTMLElement[] = [];
  out.push(h('button', { class: 'btn ghost icon mobile-only', title: 'Panel de mando', 'aria-label': 'Abrir el panel de mando', onclick: () => { app.root.classList.toggle('show-left'); app.root.classList.remove('show-right'); } }, '☰'));
  if (p) out.push(h('div', { class: 'who' }, flagEl(p, 34, 23), h('span', { class: 'name' }, p.name)));
  // Fecha con los días corriendo (el reloj de app.ts actualiza «día N» y la barra del mes en cada fotograma)
  const dl = dateLabel(w.turn);
  out.push(h('div', { class: 'date' }, h('span', { class: 'd-long' }, dl), h('span', { class: 'd-short' }, `${dl.slice(0, 3)} ${dl.slice(-4)}`),
    h('small', null, h('span', { class: 'day' }, `día ${app.day}`), app.speed ? '' : h('span', { class: 'paused' }, ' · en pausa')),
    h('span', { class: 'month-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.min(100, app.dayProgress * 100)}%` }))));
  const sp = (n: number, label: string, title: string) => h('button', { class: `btn sm icon ${n === 0 ? 'pause' : ''} ${app.speed === n ? 'active' : ''}`, 'data-speed': String(n), title, 'aria-label': title, 'aria-pressed': String(app.speed === n), onclick: () => app.setSpeed(n) }, label);
  out.push(h('div', { class: 'speed', role: 'group', 'aria-label': 'Velocidad del tiempo' },
    sp(0, '❚❚', 'Pausa (barra espaciadora)'), sp(1, '▶', 'Velocidad normal (tecla 1)'), sp(2, '▶▶', 'Rápida (tecla 2)'), sp(3, '▶▶▶', 'Muy rápida (tecla 3)'),
    h('button', { class: 'btn sm icon skip', disabled: !!w.gameOver || app.busy, title: 'Saltar al próximo mes', 'aria-label': 'Saltar al próximo mes', onclick: () => app.endTurn() }, '⏭')));
  if (p) {
    const strip = h('div', { class: 'ind-strip' });
    // Vista sencilla: cuatro cifras; con «Avanzado» abierto en el panel de mando, todas
    const keys = app.ui.cmdAdvanced ? KEYS : KEYS.filter(([k]) => SIMPLE.includes(k));
    for (const [k, hk, icon] of keys) {
      const ind = IND[k];
      const d = hk ? delta(p, hk, 1) : undefined;
      const good = d !== undefined && (d > 0) === (ind.better !== 'down');
      const val = ind.get(p, w);
      const num = h('span', null, ind.fmt(val));
      tweenNumber(app, `top:${k}`, num, val, ind.fmt);
      const el = h('div', { class: 'ind' }, h('span', { class: 'i-ic', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'i-tx' }, h('span', { class: 'k' }, SHORT[k] ?? ind.name),
          h('span', { class: 'v' }, num,
            d !== undefined && Math.abs(d) > 0.05 ? h('span', { class: `d ${good ? 'good' : 'bad'}` }, d > 0 ? '▲' : '▼') : null)));
      tip(el, indicatorTip(k, () => p, () => w));
      strip.appendChild(el);
    }
    out.push(strip);
    const ap = h('span', { class: 'ap-pill' }, h('span', { class: 'ap-ic' }, '⚡'),
      h('span', { class: 'ap-col' }, h('span', { class: 'ap-val' }, p.pol.ap.toFixed(1)), h('span', { class: 'ap-lbl' }, `capital · +${p.pol.apIncome.toFixed(1)}/mes`)));
    tip(ap, indicatorTip('ap', () => p, () => w));
    out.push(ap);
  } else out.push(h('div', { class: 'grow muted' }, '👁 Modo observador'));
  out.push(h('button', { class: 'btn ghost icon', title: 'Menú: guardar, cargar, guía', 'aria-label': 'Menú de partida', onclick: () => openGameMenu(app, app.onLoad) }, '⚙️'));
  // Móvil: los seis medidores en miniatura, siempre a la vista
  if (p) {
    out.push(h('div', { class: 'mini-gauges', role: 'group', 'aria-label': 'Estado del país' }, gauges(w, p).map((g) =>
      h('button', { class: 'mg', style: `--c:${scoreColor(g.score)}`, title: `${g.name}: ${Math.round(g.score)}/100`, 'aria-label': `${g.name}: ${Math.round(g.score)} de 100`, onclick: () => openGoal(app, g.goal) },
        h('span', { class: 'mg-ic' }, g.icon), h('span', { class: 'mg-v' }, String(Math.round(g.score)))))));
  }
  return out;
}
