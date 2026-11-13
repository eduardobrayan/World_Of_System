/** Opciones adicionales de la pantalla de inicio: objetivos y carga de partidas. */
import type { World } from '../sim/types';
import { OBJECTIVES } from '../sim/goals';
import { h, toast } from './dom';
import { importJSON, listSlots, loadSlot, SLOTS } from './storage';

export function objectiveOptions(): [string, string, string][] {
  return OBJECTIVES.map((o) => [o.id, `${o.icon} ${o.name}`, o.desc]);
}

export function startExtras(onLoad: (w: World) => void): HTMLElement[] {
  const slots = listSlots();
  const saved = slots.map((m, i) => (m ? { m, slot: SLOTS[i] } : null)).filter(Boolean) as { m: NonNullable<(typeof slots)[number]>; slot: string }[];
  return [h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', null, 'Continuar una partida'),
    saved.length ? h('div', { class: 'list' }, saved.map(({ m, slot }) => h('button', { class: 'option', onclick: async () => {
      try { onLoad(await loadSlot(slot)); } catch (e) { toast((e as Error).message, 'bad'); }
    } }, h('b', null, `${slot === 'auto' ? 'Autoguardado' : `Ranura ${slot}`}: ${m.country}`), h('div', { class: 'small ink2' }, `${m.date} · guardado ${m.savedAt}`)))) : h('div', { class: 'small muted' }, 'No hay partidas guardadas en este navegador.'),
    h('button', { class: 'btn', style: 'margin-top:8px', onclick: async () => { try { onLoad(await importJSON()); } catch (e) { toast((e as Error).message, 'bad'); } } }, '⬆ Importar partida (JSON)'))];
}
