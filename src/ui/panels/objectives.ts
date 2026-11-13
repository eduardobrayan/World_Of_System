/** Pestaña de Objetivos: progreso, cambio de objetivo y condiciones de derrota. */
import type { App } from '../app';
import { h, toast } from '../dom';
import { section, bar } from '../components';
import { OBJECTIVES, OBJECTIVE_BY_ID, MAX_TURNS, changeObjective, objectiveProgress } from '../../sim/goals';
import { dateLabel } from '../../sim/util';
import { regimeOf } from '../../sim/data';

export function renderObjectives(app: App): HTMLElement[] {
  const c = app.player;
  const w = app.world;
  if (!c || !w.player) return [h('div', { class: 'muted' }, 'Sin país.')];
  const p = w.player;
  const o = OBJECTIVE_BY_ID[p.objective];
  const prog = objectiveProgress(w, c, p.objective);
  const out: HTMLElement[] = [h('h2', null, '🎯 Objetivos')];
  out.push(h('div', { class: 'card', style: 'border-color:#2a4a70' }, h('h3', null, `${o.icon} ${o.name}`), h('p', { class: 'small ink2' }, o.desc),
    prog.items.map((it) => h('div', { style: 'margin-bottom:6px' }, h('div', { class: 'row between small' }, h('span', null, it.label), h('b', null, it.value)), bar(it.ratio * 100, 100, it.ratio >= 1 ? '#0ca30c' : undefined))),
    h('div', { class: 'small muted' }, `La partida termina en ${dateLabel(MAX_TURNS)} (${MAX_TURNS - w.turn} meses).`)));
  if (p.objectiveSuggestion) {
    const s = OBJECTIVE_BY_ID[p.objectiveSuggestion];
    out.push(h('div', { class: 'card', style: 'border-color:#8a5f10' }, h('b', null, `Los acontecimientos sugieren: ${s.icon} ${s.name}`), h('p', { class: 'small ink2' }, s.desc),
      h('button', { class: 'btn sm primary', onclick: () => { toast(changeObjective(w, s.id), 'good'); app.refresh(); } }, 'Adoptar este objetivo (gratis)')));
  }
  out.push(section('Cambiar de objetivo (⚡3)', h('div', { class: 'list' }, OBJECTIVES.filter((x) => x.id !== p.objective).map((x) => h('div', { class: 'item small row between' },
    h('div', null, h('b', null, `${x.icon} ${x.name}`), h('div', { class: 'ink2' }, x.desc)),
    h('button', { class: 'btn sm', onclick: () => { toast(changeObjective(w, x.id)); app.refresh(); } }, 'Elegir'))))));
  const reg = regimeOf(c.pol.regime);
  out.push(section('Cómo puedes perder',
    h('ul', { class: 'small ink2', style: 'margin:0;padding-left:18px' },
      reg.elections ? h('li', null, `Perder unas elecciones (próximas: ${c.pol.nextElection >= 0 ? dateLabel(c.pol.nextElection) : 'sin fecha'}).`) : h('li', null, 'Tu régimen no celebra elecciones competitivas.'),
      h('li', null, `Un golpe de Estado (riesgo actual ${c.pol.coupRisk.toFixed(1)} %/mes).`),
      h('li', null, `Una revolución (riesgo actual ${c.pol.revolutionRisk.toFixed(1)} %/mes).`),
      h('li', null, `La quiebra: dos impagos en diez años o 18 meses de hiperinflación (impagos: ${c.eco.defaults}).`),
      h('li', null, 'La derrota militar: capitular o perder el Estado.'),
      h('li', null, 'Una guerra nuclear global.'))));
  out.push(section('Historial de objetivos', h('div', { class: 'list' }, p.objectiveHistory.map((x) => h('div', { class: 'item small' }, `${dateLabel(x.turn)} · ${OBJECTIVE_BY_ID[x.objective]?.name} — ${x.reason}`)))));
  return out;
}
