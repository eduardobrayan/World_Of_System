/** Pestaña Militar: fuerzas, producción, movilización, doctrina, despliegues, postura nuclear y guerras. */
import type { App } from '../app';
import type { Country, UnitType, War } from '../../sim/types';
import { UNIT_TYPES } from '../../sim/types';
import { UNIT_BY_ID } from '../../sim/data';
import { h, modal, toast } from '../dom';
import { section, stat, plainStat, bar, histChart } from '../components';
import { ACTION_BY_ID } from '../../sim/actions';
import { openAction } from '../actionui';
import { MOBILIZATION, doctrineOf, unitCost } from '../../sim/military';
import { DOCTRINES } from '../../sim/milhandlers';
import { NUCLEAR_LEVELS, joinWar, offerPeace, peaceAcceptance, proposeCeasefire, sideOf, type PeaceTerms } from '../../sim/war';
import { allied, occupiedShare } from '../../sim/vars';
import { flagEl } from '../flags';
import { dateLabel } from '../../sim/util';
import { flushNewsToasts } from '../hooks';

export function renderMilitar(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world;
  const m = c.mil;
  const out: HTMLElement[] = [h('h2', null, '🎖 Defensa')];
  out.push(h('div', { class: 'kpis' }, ...['power', 'readiness', 'morale'].map((k) => { const e = stat(app, k, c); e.className = 'kpi'; return e; })));
  out.push(section('Capacidades',
    plainStat('Poder terrestre', m.landPower.toFixed(0)), plainStat('Poder aéreo', m.airPower.toFixed(0)), plainStat('Poder naval', m.navalPower.toFixed(0)),
    plainStat('Efectivos', `${Math.round(m.personnel)} mil`), plainStat('Tecnología militar', m.tech.toFixed(0)), plainStat('Logística', m.logistics.toFixed(0)),
    plainStat('Mantenimiento', `${m.upkeep.toFixed(1)} mm $/año frente a ${(c.eco.budget.defense * c.eco.gdp / 100).toFixed(1)} de presupuesto`, 'Si el presupuesto de defensa no cubre el mantenimiento, la preparación cae y se pierden unidades. El excedente financia reposición automática.'),
    plainStat('Armas nucleares', m.nukes > 0 ? `${m.nukes} ojivas · ${NUCLEAR_LEVELS[m.nuclearPosture]}` : 'No'),
    histChart(c, ['power'], ['Poder militar'], (v) => v.toFixed(0), 90)));

  out.push(section('Movilización y doctrina',
    h('div', { class: 'small ink2' }, `Nivel actual: ${MOBILIZATION[m.mobilization].name} (poder terrestre ×${MOBILIZATION[m.mobilization].land}, coste ${MOBILIZATION[m.mobilization].cost} % del PIB/año).`),
    h('div', { class: 'row wrap', style: 'margin:6px 0' },
      h('button', { class: 'btn sm', disabled: m.mobilization >= 3, onclick: () => openAction(app, ACTION_BY_ID.movilizar, {}) }, '⬆ Movilizar'),
      h('button', { class: 'btn sm', disabled: m.mobilization <= 0, onclick: () => openAction(app, ACTION_BY_ID.desmovilizar, {}) }, '⬇ Desmovilizar')),
    h('div', { class: 'small ink2' }, `Doctrina: ${doctrineOf(c).name}`),
    h('div', { class: 'row wrap', style: 'margin-top:4px' }, Object.entries(DOCTRINES).filter(([k]) => k !== m.doctrine).map(([k, d]) =>
      h('button', { class: 'btn sm', title: d, onclick: () => openAction(app, ACTION_BY_ID.cambiar_doctrina, { params: { doctrine: k } }) }, d.split(':')[0])))));

  // Fuerzas y producción
  const queue = m.production.filter((p) => p.cost > 0);
  out.push(section('Fuerzas y producción',
    h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Unidad'), h('th', { class: 'n' }, 'Cantidad'), h('th', { class: 'n' }, 'Coste'), h('th', null, ''))),
      h('tbody', null, UNIT_TYPES.map((k) => {
        const u = UNIT_BY_ID[k];
        return h('tr', { title: u.desc }, h('td', null, `${u.icon} ${u.name}`), h('td', { class: 'n' }, m.units[k].toFixed(m.units[k] < 10 ? 1 : 0)),
          h('td', { class: 'n' }, `${unitCost(c, k).toFixed(1)}`),
          h('td', null, h('button', { class: 'btn sm', onclick: () => orderUnits(app, k) }, 'Encargar')));
      }))),
    h('div', { class: 'small muted' }, 'Coste en miles de millones $ por unidad (brigada, batallón, escuadrón o buque).'),
    queue.length ? h('div', { style: 'margin-top:6px' }, h('h4', null, 'Encargos en curso'), queue.map((p) => h('div', { class: 'small' }, `${p.qty} × ${UNIT_BY_ID[p.unit].name}: ${p.remaining} meses`))) : null));

  // Despliegues
  const deps = Object.entries(m.deployments);
  out.push(section('Despliegues en el exterior', deps.length ? h('div', { class: 'list' }, deps.map(([id, share]) => h('div', { class: 'item small row between' },
    h('span', null, flagEl(w.countries[id], 16, 11), ` ${w.countries[id]?.name} · ${(share * 100).toFixed(0)} % del ejército de tierra`),
    h('button', { class: 'btn sm', onclick: () => openAction(app, ACTION_BY_ID.retirar_tropas, { target: w.countries[id] }) }, 'Retirar')))) : h('div', { class: 'muted small' }, 'Ninguno. Puedes desplegar tropas en un aliado desde su panel.')));

  // Postura nuclear
  if (m.nukes > 0 || c.pol.flags.programa_nuclear) {
    out.push(section('Disuasión nuclear',
      h('div', { class: 'small' }, `Postura: ${NUCLEAR_LEVELS[m.nuclearPosture]}`),
      h('div', { class: 'row wrap', style: 'margin-top:4px' },
        h('button', { class: 'btn sm danger', disabled: m.nuclearPosture >= 2, onclick: () => openAction(app, ACTION_BY_ID.alerta_nuclear, {}) }, '☢ Elevar alerta'),
        h('button', { class: 'btn sm danger', onclick: () => openAction(app, ACTION_BY_ID.uso_nuclear_tactico, {}) }, '☢ Uso táctico'),
        h('button', { class: 'btn sm', disabled: m.nuclearPosture === 0, onclick: () => openAction(app, ACTION_BY_ID.bajar_alerta, {}) }, 'Rebajar alerta'))));
  } else {
    out.push(section('Disuasión nuclear', h('div', { class: 'small ink2' }, 'No dispones de armas nucleares.'),
      h('button', { class: 'btn sm', style: 'margin-top:4px', onclick: () => openAction(app, ACTION_BY_ID.programa_nuclear, {}) }, 'Iniciar programa nuclear')));
  }

  // Guerras
  const mine = w.wars.filter((x) => sideOf(x, c.id));
  out.push(section(`Guerras (${mine.length})`, mine.length ? h('div', null, mine.map((x) => warCard(app, c, x))) : h('div', { class: 'muted small' }, 'Estás en paz.')));
  // Guerras de aliados
  const allyWars = w.wars.filter((x) => !sideOf(x, c.id) && x.ceasefire <= 0 && (allied(w, c.id, x.leaderD) || allied(w, c.id, x.leaderA)));
  if (allyWars.length) {
    out.push(section('Tus aliados en guerra', ...allyWars.map((x) => {
      const side = allied(w, c.id, x.leaderD) ? 'D' : 'A';
      const ally = w.countries[side === 'D' ? x.leaderD : x.leaderA];
      return h('div', { class: 'item small' }, h('b', null, x.name), h('div', null, `${ally.name} ${side === 'D' ? 'se defiende' : 'ataca'}.`),
        h('button', { class: 'btn sm danger', style: 'margin-top:4px', onclick: () => { joinWar(w, x, c, side); toast(`Has entrado en «${x.name}».`, 'bad'); flushNewsToasts(app); app.refresh(); } }, `Entrar en la guerra junto a ${ally.short}`));
    })));
  }
  return out;
}

function orderUnits(app: App, k: UnitType) {
  const c = app.player!;
  let qty = 2;
  let close = () => undefined as void;
  const u = UNIT_BY_ID[k];
  const info = h('div', { class: 'small' });
  const paint = () => { info.textContent = `${qty} × ${u.name}: ${(unitCost(c, k) * qty).toFixed(1)} mil millones $, listas en ${u.build} meses.`; };
  paint();
  app.modalOpen++;
  close = modal({
    title: `Encargar ${u.name}`, kicker: 'Defensa', onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('div', null, h('p', { class: 'ink2' }, u.desc),
      h('div', { class: 'stepper', style: 'margin-bottom:8px' },
        h('button', { class: 'step', onclick: () => { qty = Math.max(1, qty - 5); paint(); } }, '−5'),
        h('button', { class: 'step', onclick: () => { qty = Math.max(1, qty - 1); paint(); } }, '−1'),
        h('button', { class: 'step', onclick: () => { qty += 1; paint(); } }, '+1'),
        h('button', { class: 'step', onclick: () => { qty += 5; paint(); } }, '+5')), info),
    footer: [h('button', { class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: () => { close(); openAction(app, ACTION_BY_ID.producir_unidades, { params: { unit: k, qty } }); } }, 'Continuar')],
  });
}

function warCard(app: App, c: Country, war: War): HTMLElement {
  const w = app.world;
  const side = sideOf(war, c.id)!;
  const myScore = side === 'A' ? war.score : -war.score;
  const myExh = side === 'A' ? war.exhaustionA : war.exhaustionD;
  const enemyExh = side === 'A' ? war.exhaustionD : war.exhaustionA;
  const enemies = (side === 'A' ? war.defenders : war.attackers).map((id) => w.countries[id]);
  const friends = (side === 'A' ? war.attackers : war.defenders).map((id) => w.countries[id]);
  return h('div', { class: 'card', style: 'border-color:#6a2826' },
    h('div', { class: 'row between' }, h('b', null, war.name), war.ceasefire > 0 ? h('span', { class: 'tag' }, `Alto el fuego: ${war.ceasefire} meses`) : h('span', { class: 'tag red' }, 'Activa')),
    h('div', { class: 'small ink2' }, `Desde ${dateLabel(Math.max(0, war.start))} · tu bando: ${friends.map((x) => x.short).join(', ')} · enemigos: ${enemies.map((x) => x.short).join(', ')}`),
    plainStat('Situación', h('span', { class: myScore >= 0 ? 'good' : 'bad' }, `${myScore >= 0 ? '+' : ''}${myScore.toFixed(0)}`), 'Puntuación de guerra desde tu punto de vista (−100 a 100): avance en los frentes y cansancio relativo.'),
    plainStat('Cansancio propio / enemigo', `${myExh.toFixed(0)} / ${enemyExh.toFixed(0)}`),
    plainStat('Territorio propio ocupado', `${(occupiedShare(c) * 100).toFixed(0)} %`),
    plainStat('Bajas (miles)', `${(side === 'A' ? war.casualtiesA : war.casualtiesD).toFixed(0)} propias · ${(side === 'A' ? war.casualtiesD : war.casualtiesA).toFixed(0)} enemigas`),
    h('h4', null, 'Frentes'),
    war.fronts.filter((f) => f.a === c.id || f.d === c.id || friends.some((x) => x.id === f.a || x.id === f.d)).map((f) => {
      const mine = side === 'A' ? f.control : -f.control;
      return h('div', { class: 'small', style: 'margin-bottom:4px' },
        h('div', { class: 'row between' }, h('span', null, `${w.countries[f.a].short} → ${w.countries[f.d].short} (${f.kind === 'land' ? 'terrestre' : 'anfibio'})`), h('b', { class: mine >= 0 ? 'good' : 'bad' }, `${f.control.toFixed(0)} %`)),
        bar(Math.abs(f.control), 100, f.control >= 0 ? '#d95926' : '#3987e5'));
    }),
    h('div', { class: 'row wrap', style: 'margin-top:8px' },
      h('button', { class: 'btn sm', disabled: war.ceasefire > 0, onclick: () => { const r = proposeCeasefire(w, war, c); toast(r.text, r.accepted ? 'good' : 'bad'); flushNewsToasts(app); app.refresh(); } }, '🕊 Proponer alto el fuego'),
      h('button', { class: 'btn sm primary', onclick: () => peaceDialog(app, war) }, '📜 Negociar la paz'),
      ...enemies.filter((e) => c.mil.navalPower > e.mil.navalPower * 1.3 && !war.blockade.includes(e.id)).map((e) => h('button', { class: 'btn sm', onclick: () => openAction(app, ACTION_BY_ID.bloqueo_naval, { target: e }) }, `⚓ Bloquear a ${e.short}`))));
}

function peaceDialog(app: App, war: War) {
  const c = app.player!;
  const w = app.world;
  const terms: PeaceTerms = {};
  const box = h('div');
  const paint = () => {
    const { other, ev } = peaceAcceptance(w, war, c, terms);
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'small', style: 'margin-top:8px' }, h('b', null, `${other.name}: `), `probabilidad de aceptar ${(ev.prob * 100).toFixed(0)} %`,
      h('div', { class: 'muted' }, `Motivos: ${ev.reasons.join(', ')}`)));
  };
  const opt = (key: keyof PeaceTerms, label: string, desc: string) => {
    const cb = h('input', { type: 'checkbox', onchange: (e: Event) => { terms[key] = (e.target as HTMLInputElement).checked ? 1 : 0; paint(); } });
    return h('label', { class: 'option', style: 'display:flex;gap:8px;align-items:flex-start' }, cb, h('div', null, h('b', null, label), h('div', { class: 'small ink2' }, desc)));
  };
  paint();
  app.modalOpen++;
  let close = () => undefined as void;
  close = modal({
    title: `Negociar la paz: ${war.name}`, kicker: 'Guerra', onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('div', null, h('p', { class: 'small ink2' }, 'Elige las condiciones. Sin condiciones es una paz blanca: cada uno recupera su territorio.'),
      opt('cede', 'Cesión de territorio ocupado', 'Las regiones que ocupas pasan a ser tuyas (máximo un 35 % de su población).'),
      opt('reparations', 'Reparaciones de guerra', 'Pagará el 1 % de su PIB cada año durante 5 años.'),
      opt('demilitarize', 'Desmilitarización', 'Su poder militar se reduce un 30 % durante 10 años.'),
      opt('leaveAlliances', 'Abandono de alianzas', 'Debe romper sus alianzas militares.'),
      opt('regime', 'Cambio de régimen', 'Su gobierno queda gravemente deslegitimado.'),
      box),
    footer: [h('button', { class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: () => { const r = offerPeace(w, war, c, terms); toast(r.text, r.accepted ? 'good' : 'bad'); close(); flushNewsToasts(app); app.refresh(); } }, 'Ofrecer la paz')],
  });
}

/** Botones militares sobre otro país (panel derecho). */
export function militaryButtons(app: App, t: Country): HTMLElement {
  const c = app.player!;
  const w = app.world;
  const act = (id: string, label: string, params?: Record<string, number | string>, danger = false) => h('button', { class: `btn sm ${danger ? 'danger' : ''}`, onclick: () => openAction(app, ACTION_BY_ID[id], { target: t, params }) }, label);
  const atWarWith = w.wars.some((x) => x.ceasefire <= 0 && sideOf(x, c.id) && sideOf(x, t.id) && sideOf(x, c.id) !== sideOf(x, t.id));
  return h('div', null,
    h('h4', null, 'Militar'),
    h('div', { class: 'row wrap' },
      allied(w, c.id, t.id) ? (c.mil.deployments[t.id] ? act('retirar_tropas', 'Retirar tropas') : act('desplegar', '⛺ Desplegar tropas')) : null,
      act('maniobras', '🪖 Maniobras'),
      atWarWith ? act('bloqueo_naval', '⚓ Bloqueo naval') : null,
      !atWarWith ? act('ataque_limitado', '💥 Ataque limitado', undefined, true) : null,
      !atWarWith ? act('declarar_guerra', '⚔ Declarar la guerra', { goal: 'territory' }, true) : null));
}
