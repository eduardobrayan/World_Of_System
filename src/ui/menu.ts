/** Menú de partida: guardar, cargar, exportar e importar. */
import type { App } from './app';
import { h, modal, toast } from './dom';
import { exportJSON, importJSON, listSlots, loadSlot, saveSlot, SLOTS } from './storage';
import { showTutorial } from './tutorial';

export function openGameMenu(app: App, onLoad: (w: import('../sim/types').World) => void) {
  app.modalOpen++;
  let close = () => undefined as void;
  const slotsEl = h('div', { class: 'list' });
  const paint = () => {
    slotsEl.innerHTML = '';
    listSlots().forEach((m, i) => {
      const slot = SLOTS[i];
      slotsEl.appendChild(h('div', { class: 'item row between' },
        h('div', null, h('b', null, slot === 'auto' ? 'Autoguardado' : `Ranura ${slot}`), h('div', { class: 'small ink2' }, m ? `${m.country} · ${m.date} · guardado ${m.savedAt}` : 'vacía')),
        h('div', { class: 'row' },
          slot !== 'auto' ? h('button', { class: 'btn sm', onclick: async () => {
            try { await saveSlot(slot, app.world); toast('Partida guardada.', 'good'); paint(); } catch (e) { toast((e as Error).message, 'bad', 7000); }
          } }, 'Guardar') : null,
          h('button', { class: 'btn sm', disabled: !m, onclick: async () => {
            try { const w = await loadSlot(slot); close(); onLoad(w); } catch (e) { toast((e as Error).message, 'bad'); }
          } }, 'Cargar'))));
    });
  };
  paint();
  close = modal({
    title: 'Partida', kicker: 'Menú', onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('div', null, slotsEl,
      h('div', { class: 'row wrap', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: () => exportJSON(app.world) }, '⬇ Exportar a JSON'),
        h('button', { class: 'btn', onclick: async () => { try { const w = await importJSON(); close(); onLoad(w); } catch (e) { toast((e as Error).message, 'bad'); } } }, '⬆ Importar JSON'),
        h('button', { class: 'btn', onclick: () => { close(); showTutorial(app); } }, '❓ Tutorial'),
        h('button', { class: 'btn danger', onclick: () => { close(); app.onExit(); } }, 'Salir al menú principal')),
      h('p', { class: 'small muted', style: 'margin-top:8px' }, 'La partida se autoguarda cada 3 meses. Las partidas guardadas viven en este navegador; exporta a JSON para conservarlas o moverlas.')),
  });
}
