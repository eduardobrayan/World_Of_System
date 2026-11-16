/** Piezas de la pantalla de inicio: objetivos, «Continuar» y carga de partidas. */
import type { World } from '../sim/types';
import { OBJECTIVES } from '../sim/goals';
import { h, toast } from './dom';
import { importJSON, listSlots, loadSlot, SLOTS, type SlotMeta } from './storage';

export function objectiveOptions(): [string, string, string][] {
  return OBJECTIVES.map((o) => [o.id, `${o.icon} ${o.name}`, o.desc]);
}

function savedGames(): { m: SlotMeta; slot: string }[] {
  const slots = listSlots();
  return slots.map((m, i) => (m ? { m, slot: SLOTS[i] } : null)).filter(Boolean) as { m: SlotMeta; slot: string }[];
}

const load = (slot: string, onLoad: (w: World) => void) => async () => {
  try { onLoad(await loadSlot(slot)); } catch (e) { toast((e as Error).message, 'bad'); }
};

/** Botón grande «Continuar» con la partida más avanzada guardada (si la hay). */
export function continueButton(onLoad: (w: World) => void): HTMLElement | null {
  const saved = savedGames();
  if (!saved.length) return null;
  const best = saved.slice().sort((a, b) => (b.m.turn ?? 0) - (a.m.turn ?? 0))[0];
  return h('button', { class: 'btn continue-btn', onclick: load(best.slot, onLoad) },
    '⏯', h('span', null, h('b', null, `Continuar: ${best.m.country}`), h('span', { class: 'small muted' }, ` · ${best.m.date}`)));
}

/** Todas las partidas guardadas e importar (van dentro de «Opciones»). */
export function startExtras(onLoad: (w: World) => void): HTMLElement[] {
  const saved = savedGames();
  return [h('div', { class: 'field' }, h('span', null, '💾 Partidas guardadas'),
    saved.length ? h('div', { class: 'list' }, saved.map(({ m, slot }) => h('button', { class: 'option', style: 'margin:0', onclick: load(slot, onLoad) },
      h('b', null, `${slot === 'auto' ? 'Autoguardado' : `Ranura ${slot}`}: ${m.country}`), h('div', { class: 'small ink2' }, `${m.date} · guardado ${m.savedAt}`)))) : h('div', { class: 'small muted' }, 'Ninguna en este navegador.'),
    h('button', { class: 'btn sm', style: 'align-self:flex-start', onclick: async () => { try { onLoad(await importJSON()); } catch (e) { toast((e as Error).message, 'bad'); } } }, '⬆ Importar partida (JSON)'))];
}
