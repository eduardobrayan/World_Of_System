/** Pestaña de Diplomacia: propuestas recibidas, relaciones, tratados, sanciones, organismos, votaciones y registro de la IA. */
import type { App } from '../app';
import type { Country } from '../../sim/types';
import { h, toast } from '../dom';
import { section } from '../components';
import { flagEl } from '../flags';
import { relOp, relTrust, allied } from '../../sim/vars';
import { answerProposal, DEMANDS } from '../../sim/diplohandlers';
import { RESOLUTION_KINDS, TREATY_NAMES } from '../../sim/diplomacy';
import { ACTION_BY_ID } from '../../sim/actions';
import { openAction } from '../actionui';
import { dateLabel } from '../../sim/util';
import { divColor } from '../layers';

export function renderDiplomacy(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world;
  const out: HTMLElement[] = [h('h2', null, '🤝 Diplomacia'),
    h('p', { class: 'small ink2' }, 'Selecciona un país en el mapa para actuar sobre él (visitas, tratados, sanciones, ultimátums…). Cada país recuerda lo que haces y reacciona.')];

  // Propuestas recibidas
  const props = w.proposals.filter((p) => p.to === c.id);
  out.push(section(`Propuestas recibidas (${props.length})`, props.length ? h('div', { class: 'list' }, props.map((p) => {
    const from = w.countries[p.from];
    const isUlt = p.kind === 'ultimatum';
    return h('div', { class: 'item' },
      h('div', { class: 'row' }, flagEl(from, 18, 12), h('b', null, from.name), isUlt ? h('span', { class: 'tag red' }, 'Ultimátum') : null),
      h('div', { class: 'small' }, isUlt ? `Exige: ${DEMANDS[String(p.terms.demand)] ?? p.terms.demand}. Si te niegas tendrá un casus belli.` : `Propone: ${TREATY_NAMES[String(p.terms.type)] ?? p.text}`),
      h('div', { class: 'small muted' }, `Caduca en ${3 - (w.turn - p.turn)} meses`),
      h('div', { class: 'row', style: 'margin-top:4px' },
        h('button', { class: 'btn sm primary', onclick: () => { toast(answerProposal(w, p.id, true), 'good'); app.refresh(); } }, isUlt ? 'Ceder' : 'Aceptar'),
        h('button', { class: 'btn sm', onclick: () => { toast(answerProposal(w, p.id, false)); app.refresh(); } }, 'Rechazar')));
  })) : h('div', { class: 'muted small' }, 'Ninguna.')));

  // Votaciones pendientes en organismos de los que eres miembro
  const pend = w.resolutions.filter((r) => r.passed === undefined && w.orgs[r.org]?.members.includes(c.id));
  if (pend.length) {
    out.push(section('Votaciones pendientes', h('div', { class: 'list' }, pend.map((r) => {
      const cur = r.votes[c.id] ?? 'abs';
      const btn = (v: 'si' | 'no' | 'abs', l: string) => h('button', { class: cur === v ? 'on' : '', onclick: () => { r.votes[c.id] = v; app.refreshLeft(); } }, l);
      return h('div', { class: 'item' }, h('b', null, `${w.orgs[r.org].short}: ${r.text}`),
        h('div', { class: 'small muted' }, `Propuesta por ${w.countries[r.proposer]?.name}. Se vota en ${dateLabel(r.turn)}.`),
        h('div', { class: 'seg', style: 'margin-top:4px' }, btn('si', 'A favor'), btn('abs', 'Abstención'), btn('no', 'En contra')));
    }))));
  }

  // Relaciones
  const others = w.order.map((id) => w.countries[id]).filter((x) => x.alive && x.id !== c.id);
  const sortKey = (app.ui.relSort as string) ?? 'op';
  const sorted = [...others].sort((a, b) => sortKey === 'op' ? relOp(w, b.id, c.id) - relOp(w, a.id, c.id) : sortKey === 'trust' ? relTrust(w, b.id, c.id) - relTrust(w, a.id, c.id) : b.eco.gdp - a.eco.gdp);
  const sb = (k: string, l: string) => h('button', { class: sortKey === k ? 'on' : '', onclick: () => { app.ui.relSort = k; app.refreshLeft(); } }, l);
  out.push(section('Relaciones',
    h('div', { class: 'seg', style: 'margin-bottom:6px' }, sb('op', 'Opinión'), sb('trust', 'Confianza'), sb('gdp', 'Importancia')),
    h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'País'), h('th', { class: 'n' }, 'Opinión'), h('th', { class: 'n' }, 'Confianza'), h('th', null, ''))),
      h('tbody', null, sorted.map((o) => {
        const op = relOp(w, o.id, c.id);
        return h('tr', { class: 'click', onclick: () => app.onSelect(o.id) },
          h('td', null, flagEl(o, 18, 12), ' ', o.short),
          h('td', { class: 'n' }, h('span', { style: `display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;background:${divColor(op / 100)}` }), op.toFixed(0)),
          h('td', { class: 'n' }, relTrust(w, o.id, c.id).toFixed(0)),
          h('td', null, allied(w, c.id, o.id) ? h('span', { class: 'tag blue' }, 'aliado') : null));
      })))));

  // Tratados
  const mine = w.treaties.filter((t) => t.parties.includes(c.id));
  out.push(section(`Tratados (${mine.length})`, mine.length ? h('div', { class: 'list' }, mine.map((t) => {
    const other = w.countries[t.parties.find((p) => p !== c.id)!];
    return h('div', { class: 'item small row between' }, h('span', null, `${TREATY_NAMES[t.type] ?? t.type} · `, h('b', null, other?.name ?? '')),
      h('span', { class: 'muted' }, t.end > 0 ? `hasta ${dateLabel(t.end)}` : 'indefinido'));
  })) : h('div', { class: 'muted small' }, 'Ninguno.')));

  // Sanciones
  const imposed = w.sanctions.filter((s) => s.by === c.id), suffered = w.sanctions.filter((s) => s.target === c.id);
  out.push(section('Sanciones',
    h('div', { class: 'small' }, h('b', null, 'Impuestas por ti: '), imposed.length ? imposed.map((s) => `${w.countries[s.target]?.short} (nivel ${s.level})`).join(', ') : 'ninguna'),
    h('div', { class: 'small' }, h('b', null, 'Sufridas: '), suffered.length ? suffered.map((s) => `${w.countries[s.by]?.short} (nivel ${s.level})`).join(', ') : 'ninguna')));

  // Organismos
  out.push(section('Organismos internacionales', h('div', { class: 'list' }, Object.values(w.orgs).map((o) => {
    const member = o.members.includes(c.id);
    return h('div', { class: 'item' },
      h('div', { class: 'row between' }, h('b', null, `${o.short}`), member
        ? (o.type !== 'universal' ? h('button', { class: 'btn sm', onclick: () => openAction(app, ACTION_BY_ID.abandonar_organizacion, { params: { org: o.id } }) }, 'Abandonar') : h('span', { class: 'tag blue' }, 'miembro'))
        : h('button', { class: 'btn sm', onclick: () => openAction(app, ACTION_BY_ID.unirse_organizacion, { params: { org: o.id } }) }, 'Solicitar ingreso')),
      h('div', { class: 'small ink2' }, `${o.name} · ${o.members.length} miembros${o.mutualDefense ? ' · defensa mutua' : ''}${o.tradeBonus > 0.2 ? ' · libre comercio' : ''}`),
      member ? h('span', { class: 'tag green' }, 'Miembro') : null);
  }))));

  // Resoluciones recientes
  const recent = [...w.resolutions].filter((r) => r.passed !== undefined).reverse().slice(0, 8);
  out.push(section('Votaciones recientes', recent.length ? h('div', { class: 'list' }, recent.map((r) => h('div', { class: 'item small' },
    h('b', null, `${w.orgs[r.org]?.short}: ${r.text}`), ' — ', h('span', { class: r.passed ? 'good' : 'bad' }, r.passed ? 'aprobada' : `rechazada${r.vetoedBy ? ` (veto de ${w.countries[r.vetoedBy]?.short})` : ''}`),
    r.votes[c.id] ? h('span', { class: 'muted' }, ` · tu voto: ${r.votes[c.id]}`) : null))) : h('div', { class: 'muted small' }, 'Aún no hay votaciones.')));

  // Registro de decisiones de la IA
  const log = [...w.aiLog].reverse().filter((d) => d.target === c.id || d.actor === c.id || (app.ui.aiAll as boolean)).slice(0, 40);
  out.push(section('Por qué actúan así: registro de la IA',
    h('label', { class: 'small row', style: 'margin-bottom:6px' }, h('input', { type: 'checkbox', checked: !!app.ui.aiAll, onchange: () => { app.ui.aiAll = !app.ui.aiAll; app.refreshLeft(); } }), 'Mostrar decisiones de todo el mundo'),
    log.length ? h('div', { class: 'list' }, log.map((d) => decisionItem(app, d))) : h('div', { class: 'muted small' }, 'Sin decisiones relacionadas contigo todavía.')));
  return out;
}

export function decisionItem(app: App, d: { turn: number; actor: string; text: string; reasons: string[]; accepted?: boolean }): HTMLElement {
  const actor = app.world.countries[d.actor];
  return h('div', { class: 'item small' },
    h('div', { class: 'row' }, actor ? flagEl(actor, 16, 11) : null, h('span', null, d.text), d.accepted === false ? h('span', { class: 'tag red' }, 'no') : null),
    d.reasons.length ? h('div', { class: 'muted' }, `porque: ${d.reasons.join(' · ')}`) : null,
    h('div', { class: 'muted', style: 'font-size:11px' }, dateLabel(d.turn)));
}

/** Botones de acciones diplomáticas sobre un país (para el panel derecho). */
export function diplomaticButtons(app: App, t: Country): HTMLElement {
  const w = app.world;
  const c = app.player!;
  const act = (id: string, label: string, params?: Record<string, number | string>) => h('button', { class: 'btn sm', onclick: () => openAction(app, ACTION_BY_ID[id], { target: t, params }) }, label);
  const sancLevel = w.sanctions.find((s) => s.by === c.id && s.target === t.id)?.level ?? 0;
  return h('div', null,
    h('h4', null, 'Relaciones'),
    h('div', { class: 'row wrap' }, act('visita_diplomatica', '✈ Visita'), act('cumbre', '🤝 Cumbre'), act('ayuda_exterior', '🎁 Ayuda'), act('programa_ayuda', '📅 Programa de ayuda')),
    h('h4', null, 'Tratados'),
    h('div', { class: 'row wrap' }, act('acuerdo_comercial', 'Libre comercio'), act('alianza', 'Alianza'), act('pacto_no_agresion', 'No agresión'),
      act('cooperacion_tecnologica', 'Cooperación tecnológica'), act('acuerdo_energetico', 'Acuerdo energético'), act('romper_tratado', 'Romper tratados')),
    h('h4', null, 'Presión'),
    h('div', { class: 'row wrap' },
      ...[1, 2, 3].filter((l) => l > sancLevel).map((l) => act('sancionar', `Sanciones ${l === 3 ? '(embargo)' : `nivel ${l}`}`, { level: l })),
      sancLevel ? act('levantar_sanciones', 'Levantar sanciones') : null,
      act('aranceles', 'Aranceles 25 %'), (w.tariffs[c.id]?.[t.id] ?? 0) > 0 ? act('retirar_aranceles', 'Retirar aranceles') : null,
      act('expulsar_diplomaticos', 'Expulsar diplomáticos'), act('romper_relaciones', 'Romper relaciones')),
    h('div', { class: 'row wrap', style: 'margin-top:4px' }, ...Object.entries(DEMANDS).map(([k, v]) => act('ultimatum', `Ultimátum: ${v}`, { demand: k }))),
    h('h4', null, 'Organismos y mediación'),
    h('div', { class: 'row wrap' }, ...Object.entries(RESOLUTION_KINDS).filter(([k]) => k !== 'clima').map(([k, v]) => act('resolucion_onu', `ONU: ${v}`, { kind: k })), act('mediacion', '🕊 Mediar')));
}
