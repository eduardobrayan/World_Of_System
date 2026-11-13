/** Secciones adicionales del panel del país seleccionado. */
import type { App } from '../app';
import type { Country } from '../../sim/types';
import { GROUPS } from '../../sim/types';
import { DATA } from '../../sim/data';
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
    const op = relOp(app.world, c.id, me.id), mine = relOp(app.world, me.id, c.id);
    out.push(section(`Relación con ${me.short}`,
      plainStat('Opinión que tienen de ti', `${op.toFixed(0)}`, 'Opinión del gobierno de este país sobre el tuyo (−100 a 100). Cambia con tus acciones, su memoria y los intereses compartidos.'),
      plainStat('Tu opinión de ellos', `${mine.toFixed(0)}`),
      plainStat('Confianza en ti', `${relTrust(app.world, c.id, me.id).toFixed(0)}`, 'Confianza (0–100): sube al cumplir tratados y ayudar; cae con traiciones, amenazas y espionaje descubierto.'),
      plainStat('Alianza', allied(app.world, c.id, me.id) ? 'Sí' : 'No')));
  }
  return out;
}
