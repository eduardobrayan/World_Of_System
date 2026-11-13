/** Pantalla de fin de partida: motivo, cronología de decisiones clave y evolución. */
import type { App } from './app';
import { h, modal } from './dom';
import { dateLabel } from '../sim/util';
import { histChart } from './components';
import { endExtras } from './endExtras';

export function showGameOver(app: App) {
  const w = app.world;
  const go = w.gameOver;
  if (!go || app.ui.gameOverShown) return;
  app.ui.gameOverShown = true;
  const p = app.player;
  app.modalOpen++;
  const close = modal({
    title: go.victory ? '🏆 ¡Victoria!' : '🏳 Fin de la partida', kicker: dateLabel(go.turn), wide: true, closable: false,
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('div', null,
      h('p', { style: 'font-size:16px' }, go.text),
      p ? h('div', { class: 'grid2' },
        h('div', null, h('h4', null, 'Economía'), histChart(p, ['gdp'], ['PIB'], (v) => `${(v / 1000).toFixed(1)} bill.`, 120)),
        h('div', null, h('h4', null, 'Política'), histChart(p, ['approval', 'stability'], ['Aprobación', 'Estabilidad'], (v) => v.toFixed(0), 120)),
        h('div', null, h('h4', null, 'Crecimiento, inflación y paro'), histChart(p, ['growth', 'inflation', 'unemployment'], ['Crecimiento', 'Inflación', 'Desempleo'], (v) => `${v.toFixed(1)}%`, 120, true)),
        h('div', null, h('h4', null, 'Poder militar'), histChart(p, ['power'], ['Poder'], (v) => v.toFixed(0), 120))) : null,
      ...endExtras(app),
      h('h4', null, 'Cronología de decisiones clave'),
      h('div', { class: 'list', style: 'max-height:260px;overflow-y:auto' }, w.timeline.length
        ? [...w.timeline].reverse().map((t) => h('div', { class: 'item small' }, h('span', { class: 'muted' }, `${dateLabel(t.turn)} · `), t.text))
        : h('div', { class: 'muted small' }, 'Sin decisiones registradas.'))),
    footer: [
      h('button', { class: 'btn', onclick: () => { close(); } }, 'Ver el mundo'),
      h('button', { class: 'btn primary', onclick: () => { close(); app.onExit(); } }, 'Nueva partida'),
    ],
  });
}
