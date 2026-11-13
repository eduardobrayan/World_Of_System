/** Pestaña de Tecnología: investigación en curso, árbol por ramas, transición energética y clima. */
import type { App } from '../app';
import { h, toast } from '../dom';
import { section, plainStat, bar, stat } from '../components';
import { DATA } from '../../sim/data';
import { available, techCost } from '../../sim/tech';
import { MOD_NAMES } from '../../sim/actions';
import { tip } from '../tooltip';

export function renderTech(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world;
  const t = c.tech;
  const cur = t.current ? DATA.techs.find((x) => x.id === t.current) : null;
  const avail = new Set(available(c).map((x) => x.id));
  const out: HTMLElement[] = [h('h2', null, '🔬 Tecnología')];
  out.push(section('Investigación',
    plainStat('Puntos de investigación', `${t.points.toFixed(1)} al mes`, 'Dependen del gasto en investigación (pestaña Economía), la educación, universidades y polos tecnológicos, y de las tecnologías y acuerdos de cooperación.'),
    stat(app, 'techLevel', c),
    cur ? h('div', { style: 'margin-top:6px' }, h('div', { class: 'row between small' }, h('b', null, `En curso: ${cur.name}`), h('span', null, `${t.progress.toFixed(0)} / ${techCost(w, c, cur).toFixed(0)}`)),
      bar(t.progress, techCost(w, c, cur)), h('div', { class: 'small muted' }, `≈ ${Math.max(0, Math.ceil((techCost(w, c, cur) - t.progress) / Math.max(0.1, t.points)))} meses`)) : h('div', { class: 'muted small' }, 'Sin investigación activa.'),
    h('div', { class: 'small muted', style: 'margin-top:4px' }, 'Las tecnologías ya dominadas por gran parte del PIB mundial son más baratas (difusión). La falta de educación las encarece.')));
  out.push(section('Clima y energía', stat(app, 'renewables', c),
    plainStat('Anomalía térmica mundial', `+${w.global.temperature.toFixed(2)} ºC`, 'Sube con las emisiones mundiales; aumenta la frecuencia de sequías, inundaciones, huracanes y olas de calor.'),
    w.global.pandemic ? plainStat('Pandemia activa', `${w.global.pandemic.name} · afecta al ${((w.global.pandemic.infected[c.id] ?? 0) * 100).toFixed(1)} % de tu población`) : null));
  for (const [bid, bname] of Object.entries(DATA.techBranches)) {
    const list = DATA.techs.filter((x) => x.branch === bid).sort((a, b) => a.tier - b.tier);
    out.push(section(bname, h('div', { class: 'list' }, list.map((x) => {
      const done = t.done.includes(x.id);
      const can = avail.has(x.id);
      const isCur = t.current === x.id;
      const el = h('div', { class: 'item small', style: done ? 'opacity:0.65' : '' },
        h('div', { class: 'row between' }, h('b', null, `${'Ⅰ Ⅱ Ⅲ Ⅳ'.split(' ')[x.tier - 1]} ${x.name}`),
          done ? h('span', { class: 'tag green' }, 'Dominada') : isCur ? h('span', { class: 'tag blue' }, 'Investigando')
            : can ? h('button', { class: 'btn sm', onclick: () => { t.current = x.id; t.progress = 0; toast(`Investigando: ${x.name}`, 'good'); app.refreshLeft(); } }, `Investigar (${techCost(w, c, x).toFixed(0)})`)
              : h('span', { class: 'muted' }, `Requiere: ${x.req.map((r) => DATA.techs.find((y) => y.id === r)?.name ?? r).join(', ')}`)),
        h('div', { class: 'ink2' }, x.desc));
      tip(el, () => h('div', null, h('div', { class: 't' }, x.name), h('div', { class: 'desc' }, x.desc),
        ...Object.entries(x.mods).map(([k, v]) => h('div', { class: 'small' }, `${MOD_NAMES[k] ?? k}: ${v > 0 ? '+' : ''}${v}`)),
        h('div', { class: 'small muted' }, `Educación mínima recomendada: ${x.minEdu}`)));
      return el;
    }))));
  }
  return out;
}
