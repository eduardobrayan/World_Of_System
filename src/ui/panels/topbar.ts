/** Barra superior: país, fecha (días corriendo), velocidad, indicadores clave y salto al próximo mes. */
import type { App } from '../app';
import { h } from '../dom';
import { flagEl } from '../flags';
import { IND } from '../info';
import { indicatorTip, tip } from '../tooltip';
import { dateLabel } from '../../sim/util';
import { delta } from '../components';
import { openGameMenu } from '../menu';
import { tweenNumber } from '../live';
import type { Snapshot } from '../../sim/types';

const KEYS: [string, keyof Snapshot | null][] = [
  ['gdp', 'gdp'], ['growth', 'growth'], ['inflation', 'inflation'], ['unemployment', 'unemployment'], ['debt', 'debt'],
  ['deficit', 'deficit'], ['reserves', 'reserves'], ['approval', 'approval'], ['stability', 'stability'],
];

export function renderTopbar(app: App): HTMLElement[] {
  const w = app.world;
  const p = app.player;
  const out: HTMLElement[] = [];
  out.push(h('button', { class: 'btn ghost icon mobile-only', title: 'Paneles', onclick: () => { app.root.classList.toggle('show-left'); app.root.classList.remove('show-right'); } }, '☰'));
  if (p) out.push(h('div', { class: 'who' }, flagEl(p, 26, 17), h('span', { class: 'name' }, p.name)));
  // Fecha con los días corriendo (el reloj de app.ts actualiza «día N» y la barra del mes en cada fotograma)
  out.push(h('div', { class: 'date' }, dateLabel(w.turn),
    h('small', null, h('span', { class: 'day' }, `día ${app.day}`), app.speed ? '' : ' · en pausa'),
    h('span', { class: 'month-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.min(100, app.dayProgress * 100)}%` }))));
  const sp = (n: number, label: string, title: string) => h('button', { class: `btn sm icon ${app.speed === n ? 'active' : ''}`, title, 'aria-pressed': String(app.speed === n), onclick: () => app.setSpeed(n) }, label);
  out.push(h('div', { class: 'speed' }, sp(0, '⏸', 'Pausa (barra espaciadora)'), sp(1, '1×', 'Velocidad normal (tecla 1)'), sp(2, '2×', 'Rápida (tecla 2)'), sp(3, '3×', 'Muy rápida (tecla 3)')));
  if (p) {
    const strip = h('div', { class: 'ind-strip' });
    for (const [k, hk] of KEYS) {
      const ind = IND[k];
      const d = hk ? delta(p, hk, 1) : undefined;
      const good = d !== undefined && (d > 0) === (ind.better !== 'down');
      const val = ind.get(p, w);
      const num = h('span', null, ind.fmt(val));
      tweenNumber(app, `top:${k}`, num, val, ind.fmt);
      const el = h('div', { class: 'ind' }, h('span', { class: 'k' }, ind.name),
        h('span', { class: 'v' }, num,
          d !== undefined && Math.abs(d) > 0.05 ? h('span', { class: `d ${good ? 'good' : 'bad'}` }, d > 0 ? '▲' : '▼') : null));
      tip(el, indicatorTip(k, () => p, () => w));
      strip.appendChild(el);
    }
    out.push(strip);
    const ap = h('span', { class: 'ap-pill' }, '⚡', `${p.pol.ap.toFixed(1)}`, h('span', { class: 'small muted' }, ` +${p.pol.apIncome.toFixed(1)}/mes`));
    tip(ap, indicatorTip('ap', () => p, () => w));
    out.push(ap);
  } else out.push(h('div', { class: 'grow muted' }, 'Modo observador'));
  out.push(h('button', { class: 'btn sm ghost skip', disabled: !!w.gameOver || app.busy, title: 'Saltar al próximo mes (calcula el mes ya)', onclick: () => app.endTurn() }, '⏭', h('span', { class: 'lbl' }, ' Próximo mes')));
  out.push(h('button', { class: 'btn ghost icon', title: 'Menú de partida (guardar, cargar, exportar)', onclick: () => openGameMenu(app, app.onLoad) }, '☰'));
  out.push(h('button', { class: 'btn ghost icon mobile-only', title: 'País seleccionado', onclick: () => { app.root.classList.toggle('show-right'); app.root.classList.remove('show-left'); app.root.classList.remove('right-collapsed'); } }, 'ⓘ'));
  return out;
}
