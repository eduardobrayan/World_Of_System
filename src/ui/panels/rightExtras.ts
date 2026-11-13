/** Secciones adicionales del panel del país seleccionado. */
import type { App } from '../app';
import type { Country } from '../../sim/types';
import { GROUPS } from '../../sim/types';
import { DATA, personalityOf } from '../../sim/data';
import { relationTarget } from '../../sim/diplomacy';
import { diplomaticButtons, decisionItem } from './diplomacy';
import { militaryButtons } from './militar';
import { dateLabel } from '../../sim/util';
import { h } from '../dom';
import { bar, section, plainStat } from '../components';
import { relOp, relTrust, allied } from '../../sim/vars';
import { tip, contributions } from '../tooltip';

export function rightExtras(app: App, c: Country): HTMLElement[] {
  const out: HTMLElement[] = [];
  const me = app.player;
  if (me && me.id === c.id) {
    out.push(section('Apoyo de los grupos sociales', ...GROUPS.map((g) => {
      const gs = c.groups[g];
      const def = DATA.groups[g];
      const el = h('div', { style: 'margin-bottom:5px' },
        h('div', { class: 'row between small' }, h('span', null, `${def.icon} ${def.name}`), h('b', null, gs.support.toFixed(0))),
        bar(gs.support, 100, gs.support < 35 ? '#d03b3b' : gs.support > 60 ? '#0ca30c' : undefined));
      tip(el, () => h('div', null, h('div', { class: 't' }, def.name), h('div', { class: 'desc' }, def.desc),
        h('div', { class: 'small' }, `Radicalización: ${gs.radical.toFixed(0)}`), contributions(c.explain[`group.${g}`] ?? [])));
      return el;
    })));
  } else if (me) {
    const w = app.world;
    const op = relOp(app.world, c.id, me.id), mine = relOp(app.world, me.id, c.id);
    const opEl = plainStat('Opinión que tienen de ti', `${op.toFixed(0)} → ${relationTarget(w, c, me).value.toFixed(0)}`);
    tip(opEl, () => h('div', null, h('div', { class: 't' }, 'Opinión sobre tu país'),
      h('div', { class: 'desc' }, 'La opinión deriva lentamente hacia el valor de la derecha. Esto es lo que la determina:'), contributions(relationTarget(w, c, me).parts)));
    const mem = c.memory.filter((m) => m.about === me.id).slice(-6).reverse();
    out.push(section(`Relación con ${me.short}`,
      opEl,
      plainStat('Tu opinión de ellos', `${mine.toFixed(0)}`),
      plainStat('Confianza en ti', `${relTrust(app.world, c.id, me.id).toFixed(0)}`, 'Confianza (0–100): sube al cumplir tratados y ayudar; cae con traiciones, amenazas y espionaje descubierto.'),
      plainStat('Alianza', allied(app.world, c.id, me.id) ? 'Sí' : 'No'),
      plainStat('Amenaza que percibe de ti', (c.ai.threat[me.id] ?? 0).toFixed(2), 'Amenaza percibida: tu poder militar, tu hostilidad y la cercanía. Un valor alto le lleva a rearmarse y buscar aliados contra ti.'),
      mem.length ? h('div', { style: 'margin-top:6px' }, h('div', { class: 'small muted' }, 'Lo que recuerda de ti:'),
        mem.map((m) => h('div', { class: `small ${m.value >= 0 ? 'good' : 'bad'}` }, `${m.text} (${m.value >= 0 ? '+' : ''}${m.value.toFixed(0)}, ${dateLabel(m.turn)})`))) : null));
    out.push(h('div', { class: 'card' }, h('h3', null, 'Acciones'), diplomaticButtons(app, c), militaryButtons(app, c)));
    const dec = [...c.ai.lastDecisions].reverse().slice(0, 6);
    out.push(section(`Decisiones recientes de ${c.short}`, dec.length ? h('div', { class: 'list' }, dec.map((d) => decisionItem(app, d))) : h('div', { class: 'muted small' }, 'Sin decisiones registradas.'),
      h('div', { class: 'small muted', style: 'margin-top:4px' }, `Personalidad: ${personalityOf(c.ai.personality).name} · agresividad ${(c.ai.aggression * 100).toFixed(0)} · pragmatismo ${(c.ai.pragmatism * 100).toFixed(0)} · aversión al riesgo ${(c.ai.riskAversion * 100).toFixed(0)} · fiabilidad ${(c.ai.reliability * 100).toFixed(0)}`)));
  }
  return out;
}
