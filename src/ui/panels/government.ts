/** Pestaña de Gobierno: régimen, elecciones, parlamento, políticas, leyes, acciones de gobierno y ministros. */
import type { App } from '../app';
import type { Ministry } from '../../sim/types';
import { MINISTRIES } from '../../sim/types';
import { DATA, ideologyOf, regimeOf } from '../../sim/data';
import { ACTION_BY_ID, actionsIn, previewAction, repealLaw } from '../../sim/actions';
import { projectedVote } from '../../sim/elections';
import { MINISTRY_EFFECT, MINISTRY_NAMES, ministerCandidates, profileName } from '../../sim/govhandlers';
import { h, modal, toast } from '../dom';
import { section, stat, plainStat, bar } from '../components';
import { openAction } from '../actionui';
import { contributions, tip } from '../tooltip';
import { dateLabel } from '../../sim/util';
import { SERIES } from '../charts';

export function renderGovernment(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world;
  const reg = regimeOf(c.pol.regime);
  const ideo = ideologyOf(c.pol.ideology);
  const out: HTMLElement[] = [h('h2', null, '🏛 Gobierno')];
  out.push(h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('div', null, h('b', null, `${c.pol.leaderTitle} ${c.pol.leaderName}`), h('div', { class: 'small ink2' }, `${c.pol.govParty} · ${ideo.name}`)),
      h('span', { class: 'tag' }, reg.name)),
    h('div', { class: 'grid2', style: 'margin-top:6px' }, stat(app, 'stability', c), stat(app, 'legitimacy', c), stat(app, 'approval', c), stat(app, 'corruption', c),
      stat(app, 'coupRisk', c), stat(app, 'revolutionRisk', c))));

  // Elecciones y parlamento
  if (reg.elections && c.pol.nextElection >= 0) {
    const pv = projectedVote(w, c);
    const months = c.pol.nextElection - w.turn;
    const voteEl = plainStat('Voto previsto al gobierno', h('span', { class: pv.value >= 50 ? 'good' : 'bad' }, `${pv.value.toFixed(1)} %`));
    tip(voteEl, () => h('div', null, h('div', { class: 't' }, 'Intención de voto'), h('div', { class: 'desc' }, 'Necesitas más del 50 % para seguir gobernando. Perder las elecciones termina la partida.'), contributions(pv.parts)));
    out.push(section('Elecciones', plainStat('Próximas elecciones', `${dateLabel(c.pol.nextElection)} (${months} meses)`), voteEl,
      bar(pv.value, 100, pv.value >= 50 ? '#0ca30c' : '#d03b3b')));
  } else {
    out.push(section('Elecciones', h('div', { class: 'small ink2' }, reg.elections ? 'Elecciones suspendidas.' : 'Este régimen no celebra elecciones competitivas. Tus amenazas son el golpe de Estado y la revolución.')));
  }
  const tot = c.pol.parties.reduce((a, p) => a + p.seats, 0) || 100;
  out.push(section(reg.parliament ? 'Parlamento' : 'Cámara (consultiva)',
    h('div', { style: 'display:flex;height:14px;border-radius:4px;overflow:hidden;margin-bottom:6px;gap:2px' },
      c.pol.parties.map((p, i) => h('i', { style: `flex:${p.seats};background:${p.gov ? SERIES[0] : ideologyOf(p.ideology).color};opacity:${p.gov ? 1 : 0.65}`, title: `${p.name}: ${((p.seats / tot) * 100).toFixed(1)} %` }))),
    ...c.pol.parties.map((p) => plainStat(`${p.gov ? '● ' : ''}${p.name}`, `${((p.seats / tot) * 100).toFixed(1)} % · ${ideologyOf(p.ideology).name}`)),
    h('div', { class: 'small muted', style: 'margin-top:4px' }, reg.parliament ? '● partidos del gobierno. Las leyes necesitan mayoría: los partidos votan según su ideología.' : 'En este régimen las decisiones no necesitan aprobación parlamentaria.')));

  // Políticas por niveles
  const pol = DATA.policies.map((pd) => {
    const cur = c.pol.policies[pd.id] ?? 0;
    const row = h('div', { style: 'margin-bottom:8px' },
      h('div', { class: 'row between' }, h('b', null, pd.name), h('span', { class: 'small muted' }, `⚡${pd.ap}`)),
      h('div', { class: 'seg', style: 'margin-top:3px;flex-wrap:wrap' }, pd.levels.map((lv, i) => h('button', {
        class: i === cur ? 'on' : '', title: lv.desc,
        onclick: () => { if (i !== cur) openAction(app, ACTION_BY_ID.cambio_politica, { params: { policy: pd.id, level: i } }); },
      }, lv.name))));
    tip(row.firstChild as HTMLElement, () => h('div', null, h('div', { class: 't' }, pd.name), h('div', { class: 'desc' }, pd.desc), ...pd.levels.map((lv, i) => h('div', { class: 'small' }, `${i === cur ? '▶ ' : ''}${lv.name}: ${lv.desc}`))));
    return row;
  });
  out.push(section('Políticas nacionales', ...pol));

  // Leyes
  const laws = actionsIn('ley').map((def) => {
    const inForce = !!c.pol.flags[def.id];
    const p = previewAction(w, def, { actor: c });
    return h('div', { class: 'item' },
      h('div', { class: 'row between' }, h('b', null, def.name),
        inForce ? h('span', { class: 'row' }, h('span', { class: 'tag green' }, 'En vigor'), h('button', { class: 'btn sm', onclick: () => { const r = repealLaw(w, c, def.id); toast(r.text, r.passed ? 'good' : 'bad'); app.refresh(); } }, 'Derogar'))
          : h('button', { class: 'btn sm', disabled: !p.ok, onclick: () => openAction(app, def, {}) }, `Proponer ⚡${p.ap}`)),
      h('div', { class: 'small ink2' }, def.desc),
      !inForce && p.unmet.length ? h('div', { class: 'small muted' }, p.unmet.join(' · ')) : null);
  });
  out.push(section('Leyes y reformas', h('div', { class: 'list' }, laws)));

  const progs = (cat: string, title: string) => section(title, h('div', { class: 'list' }, actionsIn(cat).map((def) => {
    const p = previewAction(w, def, { actor: c });
    return h('div', { class: 'item' },
      h('div', { class: 'row between' }, h('b', null, def.name), h('button', { class: 'btn sm', disabled: !p.ok, onclick: () => openAction(app, def, {}) }, `⚡${p.ap}`)),
      h('div', { class: 'small ink2' }, def.desc),
      p.unmet.length ? h('div', { class: 'small muted' }, p.unmet.join(' · ')) : null);
  })));
  out.push(progs('economia', 'Programas económicos'));
  out.push(progs('social', 'Programas sociales'));
  out.push(progs('gobierno', 'Acciones de gobierno'));

  // Ministros
  out.push(section('Consejo de ministros', h('div', { class: 'list' }, MINISTRIES.map((m) => {
    const mi = c.pol.ministers.find((x) => x.ministry === m);
    const el = h('div', { class: 'item' },
      h('div', { class: 'row between' }, h('div', null, h('b', null, MINISTRY_NAMES[m]), h('div', { class: 'small ink2' }, mi ? `${mi.name} · ${profileName(mi)}` : 'Vacante')),
        h('button', { class: 'btn sm', onclick: () => chooseMinister(app, m) }, 'Sustituir')),
      mi ? h('div', { class: 'grid2 small' }, h('div', null, `Competencia ${mi.competence.toFixed(0)}`, bar(mi.competence)), h('div', null, `Lealtad ${mi.loyalty.toFixed(0)}`, bar(mi.loyalty, 100, mi.loyalty < 40 ? '#d03b3b' : undefined))) : null);
    tip(el, () => h('div', null, h('div', { class: 't' }, MINISTRY_NAMES[m]), h('div', { class: 'desc' }, MINISTRY_EFFECT[m]), h('div', { class: 'small muted' }, 'Los ministros poco leales pueden dimitir o protagonizar escándalos.')));
    return el;
  }))));
  return out;
}

function chooseMinister(app: App, ministry: Ministry) {
  const c = app.player!;
  const cands = ministerCandidates(app.world, c, ministry);
  let close = () => undefined as void;
  app.modalOpen++;
  close = modal({
    title: `Nuevo ministro de ${MINISTRY_NAMES[ministry]}`, kicker: 'Gobierno',
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('div', null, h('p', { class: 'small ink2' }, MINISTRY_EFFECT[ministry]),
      cands.map((m, i) => h('button', { class: 'option', onclick: () => { close(); openAction(app, ACTION_BY_ID.cambio_ministro, { params: { ministry, idx: i } }); } },
        h('b', null, `${m.name} — ${profileName(m)}`),
        h('div', { class: 'small ink2' }, `Competencia ${m.competence.toFixed(0)} · lealtad ${m.loyalty.toFixed(0)}`),
        h('div', { class: 'fx' }, m.profile === 'tecnocrata' ? 'Muy competente, poco leal. Gusta a los empresarios.' : m.profile === 'leal' ? 'Leal al partido; competencia moderada.' : `Representa a un grupo social (${m.group}): ese grupo te apoyará más mientras esté en el cargo.`)))),
  });
}
