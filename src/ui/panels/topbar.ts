/** Barra superior: país, fecha, velocidad, indicadores clave y fin de turno. */
import type { App } from '../app';
import { h } from '../dom';
import { flagEl } from '../flags';
import { IND } from '../info';
import { indicatorTip, tip } from '../tooltip';
import { dateLabel } from '../../sim/util';
import { delta } from '../components';
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
  out.push(h('div', { class: 'date' }, dateLabel(w.turn), h('small', { class: 'day' }, app.speed ? 'día 1' : `turno ${w.turn + 1}`)));
  const sp = (n: number, label: string, title: string) => h('button', { class: `btn sm icon ${app.speed === n ? 'active' : ''}`, title, onclick: () => app.setSpeed(n) }, label);
  out.push(h('div', { class: 'speed' }, sp(0, '⏸', 'Pausa'), sp(1, '▶', 'Velocidad normal'), sp(2, '⏩', 'Rápida'), sp(3, '⏭', 'Muy rápida')));
  if (p) {
    const strip = h('div', { class: 'ind-strip' });
    for (const [k, hk] of KEYS) {
      const ind = IND[k];
      const d = hk ? delta(p, hk, 1) : undefined;
      const good = d !== undefined && (d > 0) === (ind.better !== 'down');
      const el = h('div', { class: 'ind' }, h('span', { class: 'k' }, ind.name),
        h('span', { class: 'v' }, ind.fmt(ind.get(p, w)),
          d !== undefined && Math.abs(d) > 0.05 ? h('span', { class: `d ${good ? 'good' : 'bad'}` }, d > 0 ? '▲' : '▼') : null));
      tip(el, indicatorTip(k, () => p, () => w));
      strip.appendChild(el);
    }
    out.push(strip);
    const ap = h('span', { class: 'ap-pill' }, '⚡', `${p.pol.ap.toFixed(1)}`, h('span', { class: 'small muted' }, ` +${p.pol.apIncome.toFixed(1)}/mes`));
    tip(ap, indicatorTip('ap', () => p, () => w));
    out.push(ap);
  } else out.push(h('div', { class: 'grow muted' }, 'Modo observador'));
  out.push(h('button', { class: 'btn primary', disabled: !!w.gameOver || app.busy, title: 'Avanzar un mes', onclick: () => app.endTurn() }, 'Fin de turno ▸'));
  out.push(h('button', { class: 'btn ghost icon mobile-only', title: 'País seleccionado', onclick: () => { app.root.classList.toggle('show-right'); app.root.classList.remove('show-left'); app.root.classList.remove('right-collapsed'); } }, 'ⓘ'));
  return out;
}
