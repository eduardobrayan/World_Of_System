/**
 * Misiones en la interfaz: la respuesta visible a «¿y ahora qué hago?».
 *  - Tarjeta «Tu misión» en lo alto del panel de mando y barra compacta sobre el mapa (móvil y otras pestañas).
 *  - Botón «¡Vamos!»: lleva directamente al sitio donde se cumple (catálogo con ⭐, ficha de un país, mapa propio…).
 *  - Al cumplirla: celebración con el premio y aparece la siguiente.
 *  - «Mi mandato»: rango, escalera de rangos, cambio de misión e historial.
 */
import type { App } from './app';
import type { Country, MissionEntry } from '../sim/types';
import { h, toast } from './dom';
import { bar } from './components';
import { sfx } from './sound';
import {
  MISSION_BY_ID, INTRO_COUNT, RANKS, missionCandidates, missionName, missionProgress, missionTitle, missionText, missionsOf, rankOf, swapMission, updateMissions,
  type MissionDef,
} from '../sim/missions';
import { ACTION_BY_ID, previewAction } from '../sim/actions';
import { evaluateProposal } from '../sim/ai';
import { allied, hasTreaty, relOp } from '../sim/vars';
import { isAtWarWith } from '../sim/diplomacy';
import { topPartners } from '../sim/market';
import { dateLabel } from '../sim/util';
import { GOALS, openGoal } from './hub';
import { adviceFor, gauges } from './panels/command';

const GOLD = '#f5b740';

function current(app: App) {
  const st = missionsOf(app.world);
  const run = st?.current;
  const def = run ? MISSION_BY_ID[run.id] : null;
  return st && run && def ? { st, run, def } : null;
}

/** País al que conviene llevar al jugador para comerciar o aliarse: el más dispuesto a decir que sí. */
function pickCountry(app: App, c: Country, kind: 'trade' | 'ally'): Country | null {
  const w = app.world;
  const others = w.order.map((id) => w.countries[id]).filter((x) => x.alive && x.id !== c.id && !isAtWarWith(w, c.id, x.id));
  const weight: Record<string, number> = Object.fromEntries(topPartners(w, c.id, 12).map((p, i) => [p.id, 1 - i * 0.05]));
  let best: Country | null = null, bestScore = -Infinity;
  for (const t of others) {
    let s: number;
    if (kind === 'trade') {
      if (hasTreaty(w, c.id, t.id, 'trade')) continue;
      if (Object.values(w.orgs).some((o) => o.tradeBonus >= 0.3 && o.members.includes(c.id) && o.members.includes(t.id))) continue;
      // Que acepte el otro país… y que tu propio parlamento no lo tumbe
      const own = previewAction(w, ACTION_BY_ID.acuerdo_comercial, { actor: c, target: t }).vote?.prob ?? 1;
      s = evaluateProposal(w, c, t, 'trade').prob * own + (weight[t.id] ?? 0) * 0.35;
    } else {
      if (allied(w, c.id, t.id)) continue;
      s = evaluateProposal(w, c, t, 'alliance').prob + relOp(w, t.id, c.id) / 400;
    }
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

/** «¡Vamos!»: lleva al jugador al sitio exacto donde se cumple la misión. */
export function goMission(app: App) {
  const cur = current(app);
  const c = app.player;
  if (!cur || !c) return;
  const go = cur.def.go;
  app.root.classList.remove('show-left');
  switch (go.kind) {
    case 'advice': {
      // Lo más urgente que se puede hacer ya; si no hay nada, el tema del medidor más bajo
      // (para estrenarse, nada que el parlamento vaya a tumbar)
      const can = (id: string) => { const d = ACTION_BY_ID[id]; const pv = d ? previewAction(app.world, d, { actor: c }) : null; return !!pv && pv.ok && (pv.vote?.prob ?? 1) >= 0.6; };
      const ids = adviceFor(app, c).flatMap((a) => a.actions ?? []).filter(can);
      const goal = GOALS.find((g) => ids.length && g.actions.includes(ids[0])) ?? GOALS.find((g) => g.id === [...gauges(app.world, c)].sort((a, b) => a.score - b.score)[0].goal) ?? GOALS[0];
      openGoal(app, goal.id, new Set(ids.length ? ids : goal.actions.filter(can).slice(0, 3)));
      break;
    }
    case 'goal':
      openGoal(app, go.id ?? 'economia');
      break;
    case 'tab':
      app.setTab(go.id ?? 'mando');
      break;
    case 'local':
      app.onOpenLocal(c.id);
      if (go.hint) toast(go.hint, 'info', 8000, '👉');
      break;
    case 'country': {
      const t = pickCountry(app, c, go.pick ?? 'trade');
      if (app.view === 'local') app.closeLocal();
      if (t) { app.onSelect(t.id); app.map.focus(t.id); }
      toast(t ? (go.hint ?? '') : 'Pulsa un país del mapa para tratar con él.', 'info', 9000, '👉');
      break;
    }
  }
}

function stageLabel(app: App, def: MissionDef): string {
  const st = missionsOf(app.world)!;
  if (def.stage === 'intro') {
    const n = st.log.filter((e) => MISSION_BY_ID[e.id]?.stage === 'intro').length + 1;
    return `Primeros pasos · ${Math.min(n, INTRO_COUNT)} de ${INTRO_COUNT}`;
  }
  return `Misión nº ${st.done + 1}`;
}

const rewardEl = (def: MissionDef) => h('span', { class: 'mc-reward', title: 'Premio al cumplirla: capital político y prestigio' },
  h('span', { class: 'rw ap' }, `⚡ +${def.reward.ap}`), h('span', { class: 'rw st' }, `⭐ +${def.reward.prestige}`));

const isFresh = (app: App) => Number(app.ui.missionFresh ?? 0) > Date.now();

/** Tarjeta grande «Tu misión» (panel de mando y pestaña de misiones). */
export function missionCard(app: App, withRank = true): HTMLElement | null {
  const cur = current(app);
  if (!cur || app.world.gameOver) return null;
  const { st, run, def } = cur;
  const pr = missionProgress(app.world, run);
  const rk = rankOf(st.prestige);
  return h('section', { class: `mission-card ${isFresh(app) ? 'fresh' : ''}`, 'data-mission': def.id, 'aria-label': 'Tu misión' },
    h('div', { class: 'mc-top' }, h('span', { class: 'mc-kicker' }, '🎯 Tu misión'), h('span', { class: 'mc-step' }, stageLabel(app, def))),
    h('div', { class: 'mc-main' }, h('span', { class: 'mc-ic', 'aria-hidden': 'true' }, def.icon),
      h('div', { class: 'mc-tx' }, h('b', { class: 'mc-name' }, missionName(def, run)), h('span', { class: 'mc-text' }, missionText(def, run)))),
    h('div', { class: 'mc-how' }, h('span', { 'aria-hidden': 'true' }, '👉'), h('span', null, def.how)),
    h('div', { class: 'mc-prog' }, bar(Math.max(4, pr.ratio * 100), 100, GOLD), h('span', { class: 'mc-lbl' }, pr.label),
      pr.monthsLeft >= 0 ? h('span', { class: `mc-time ${pr.monthsLeft <= 3 ? 'soon' : ''}`, title: 'Tiempo que queda para cumplirla' }, `⏳ ${pr.monthsLeft} ${pr.monthsLeft === 1 ? 'mes' : 'meses'}`) : null),
    h('div', { class: 'mc-foot' },
      h('button', { class: 'btn primary big mc-go', onclick: () => goMission(app) }, '¡Vamos!', h('span', { 'aria-hidden': 'true' }, ' ›')),
      rewardEl(def)),
    withRank ? h('button', { class: 'mc-rank', title: 'Ver mi mandato: rangos, otras misiones e historial', onclick: () => app.setTab('objetivos') },
      h('span', { class: 'rk-ic' }, rk.rank.icon), h('b', { class: 'rk-tx' }, rk.rank.name),
      h('span', { class: 'rk-st' }, rk.next ? `⭐ ${st.prestige}/${rk.next.min}` : `⭐ ${st.prestige}`),
      h('span', { class: 'rk-go', 'aria-hidden': 'true' }, '›')) : null);
}

/** Barra compacta sobre el mapa: siempre a la vista en móvil y cuando el panel muestra otra pestaña. */
export function missionBar(app: App): HTMLElement | null {
  const cur = current(app);
  if (!cur || app.world.gameOver) return null;
  const { run, def } = cur;
  const pr = missionProgress(app.world, run);
  return h('div', { class: `mission-bar ${isFresh(app) ? 'fresh' : ''}`, role: 'group', 'aria-label': 'Tu misión' },
    h('button', { class: 'mb-info', title: 'Ver la misión completa', onclick: () => app.setTab('mando') },
      h('span', { class: 'mb-ic', 'aria-hidden': 'true' }, def.icon),
      h('span', { class: 'mb-tx' }, h('span', { class: 'mb-k' }, '🎯 Tu misión'), h('b', null, missionName(def, run)),
        h('span', { class: 'mb-pr' }, bar(Math.max(4, pr.ratio * 100), 100, GOLD), h('span', null, pr.label)))),
    h('button', { class: 'btn primary mb-go', onclick: () => goMission(app) }, '¡Vamos! ›'));
}

/** Comprueba las misiones ahora (tras una acción o al pasar el mes) y celebra las recién cumplidas. */
export function checkMissions(app: App) {
  const st = missionsOf(app.world);
  if (!st) return;
  updateMissions(app.world);
  const last = app.ui.missionLast as MissionEntry | null | undefined;
  const idx = last ? st.log.indexOf(last) : -1;
  const fresh = last && idx < 0 ? [] : st.log.slice(idx + 1); // si el historial se recortó, nada que anunciar
  markMissionsSeen(app);
  if (!fresh.length) return;
  const won = fresh.filter((e) => e.ok);
  if (won.length) celebrate(app, won[won.length - 1].id, won[won.length - 1].name);
  else toast(`Se acabó el plazo de «${fresh[fresh.length - 1].name}». Tienes una misión nueva.`, 'info', 6000, '⌛');
  app.ui.missionFresh = Date.now() + 9000;
}

/** Marca el historial como visto (al empezar o tras un cambio de misión hecho por el jugador). */
export function markMissionsSeen(app: App) {
  const log = missionsOf(app.world)?.log ?? [];
  app.ui.missionLast = log[log.length - 1] ?? null;
}

function celebrate(app: App, id: string, name: string) {
  const def = MISSION_BY_ID[id];
  const st = missionsOf(app.world);
  if (!def || !st) return;
  const before = rankOf(st.prestige - def.reward.prestige), now = rankOf(st.prestige);
  const up = now.index > before.index;
  const next = st.current ? MISSION_BY_ID[st.current.id] : null;
  document.querySelector('.mission-win')?.remove();
  const colors = ['#f5b740', '#4b8bff', '#3ccf78', '#f2605e', '#9a8cf0', '#ffffff'];
  const confetti = Array.from({ length: 28 }, (_, i) => h('i', { style: `--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.09}s;--r:${(i * 53) % 360}deg;--c:${colors[i % colors.length]};--w:${6 + (i % 3) * 3}px` }));
  const el = h('div', { class: `mission-win ${up ? 'rank' : ''}`, role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'mw-confetti', 'aria-hidden': 'true' }, confetti),
    h('div', { class: 'mw-card' },
      h('div', { class: 'mw-ic', 'aria-hidden': 'true' }, up ? now.rank.icon : '✅'),
      h('div', { class: 'mw-k' }, up ? `¡Nuevo rango: ${now.rank.name}!` : '¡Misión cumplida!'),
      h('div', { class: 'mw-name' }, name),
      h('div', { class: 'mw-rw' }, h('span', { class: 'rw ap' }, `⚡ +${def.reward.ap} capital`), h('span', { class: 'rw st' }, `⭐ +${def.reward.prestige} prestigio`)),
      next && st.current ? h('div', { class: 'mw-next' }, h('span', null, 'Siguiente misión'), h('b', null, `${next.icon} ${missionName(next, st.current)}`)) : null));
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), up ? 4600 : 3600);
  setTimeout(() => el.remove(), up ? 5200 : 4200);
  sfx('cheer', 0.9);
}

/** Bloque «Mi mandato» de la pestaña de misiones: rango, misión, alternativas e historial. */
export function mandatePanel(app: App): HTMLElement[] {
  const st = missionsOf(app.world);
  if (!st) return [];
  const rk = rankOf(st.prestige);
  const ladder = h('div', { class: 'rank-ladder', role: 'list', 'aria-label': 'Rangos' }, RANKS.map((r, i) =>
    h('div', { class: `rl ${i < rk.index ? 'past' : i === rk.index ? 'now' : ''}`, role: 'listitem', title: `${r.name}: ${r.min} de prestigio` },
      h('span', { class: 'rl-ic' }, r.icon), h('b', null, r.name), h('span', { class: 'rl-min' }, `⭐ ${r.min}`))));
  const out: HTMLElement[] = [
    h('h2', null, '🏅 Mi mandato'),
    h('div', { class: 'card mandate' },
      h('div', { class: 'row between' }, h('b', { style: 'font-size:16px' }, `${rk.rank.icon} ${rk.rank.name}`), h('span', { class: 'small ink2' }, `${st.done} ${st.done === 1 ? 'misión cumplida' : 'misiones cumplidas'}`)),
      h('div', { style: 'margin:8px 0 4px' }, bar(rk.ratio * 100, 100, GOLD)),
      h('div', { class: 'small ink2' }, rk.next ? `⭐ ${st.prestige} de prestigio · te faltan ${rk.next.min - st.prestige} para ser ${rk.next.name}` : `⭐ ${st.prestige} de prestigio · has llegado a lo más alto`),
      ladder,
      h('p', { class: 'small muted', style: 'margin:10px 0 0' }, 'Cumple misiones para ganar prestigio (⭐) y capital político (⚡). Siempre tienes una en marcha: síguela y nunca te quedarás sin saber qué hacer.')),
  ];
  const card = missionCard(app, false);
  if (card) out.push(card);
  const options = app.world.gameOver ? [] : missionCandidates(app.world).slice(0, 3);
  if (options.length) {
    out.push(h('h4', null, '🔄 ¿Prefieres otra misión?'), h('div', { class: 'list' }, options.map((m) => h('div', { class: 'item row between mission-opt' },
      h('span', { class: 'mo-ic' }, m.icon),
      h('div', { class: 'grow' }, h('b', null, missionTitle(m)), h('div', { class: 'small ink2' }, `Premio: ⚡ +${m.reward.ap} · ⭐ +${m.reward.prestige}`)),
      h('button', { class: 'btn sm', onclick: () => { toast(swapMission(app.world, m.id), 'info', 4000, '🎯'); markMissionsSeen(app); app.ui.missionFresh = Date.now() + 6000; app.setTab('mando'); } }, 'Elegir')))));
  }
  if (st.log.length) {
    out.push(h('h4', null, '📜 Misiones anteriores'), h('div', { class: 'list' }, [...st.log].reverse().slice(0, 10).map((e) =>
      h('div', { class: 'item small row' }, h('span', null, e.ok ? '✅' : '➖'), h('span', { class: 'grow' }, e.name), h('span', { class: 'muted' }, dateLabel(e.turn))))));
  }
  return out;
}

/** Línea de la pantalla final: rango alcanzado y misiones cumplidas. */
export function missionSummary(app: App): HTMLElement | null {
  const st = missionsOf(app.world);
  if (!st) return null;
  const rk = rankOf(st.prestige);
  return h('div', { class: 'card mandate-end' }, h('span', { class: 'me-ic' }, rk.rank.icon),
    h('div', null, h('b', null, `Rango alcanzado: ${rk.rank.name}`), h('div', { class: 'small ink2' }, `⭐ ${st.prestige} de prestigio · ${st.done} ${st.done === 1 ? 'misión cumplida' : 'misiones cumplidas'}`)));
}

