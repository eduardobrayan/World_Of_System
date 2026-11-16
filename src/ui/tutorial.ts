/**
 * Guía interactiva de los primeros minutos: resalta dónde mirar o hacer clic, con frases cortas.
 * Algunos pasos esperan a que el jugador haga algo (p. ej. elegir un país en el mapa).
 * El reloj se detiene mientras dura la guía.
 */
import type { App } from './app';
import { h, toast } from './dom';

interface Step {
  sel: string | (() => string); // elemento que se resalta
  icon: string;
  title: string;
  text: string;
  before?: (app: App) => void;
  waitFor?: (app: App) => boolean; // el paso avanza solo cuando se cumple
}

const KEY = 'wos:guia';
const narrow = () => window.matchMedia('(max-width: 980px)').matches;

const STEPS: Step[] = [
  { sel: () => (narrow() ? '.mini-gauges' : '.cmd-gauges'), icon: '🎛', title: 'Cómo va tu país', text: 'Verde: bien. Ámbar: regular. Rojo: mal. Pulsa uno para mejorarlo.',
    before: (app) => { app.setTab('mando'); app.root.classList.remove('show-left'); } },
  { sel: '.advisors', icon: '🔔', title: 'Lo urgente', text: 'Aquí sale lo que corre prisa, con el botón para arreglarlo.',
    before: (app) => { app.setTab('mando'); } },
  { sel: '.dock', icon: '👇', title: 'Tus acciones', text: 'Todo lo que puedes hacer, por temas. Pulsa uno.',
    before: (app) => { app.root.classList.remove('show-left'); } },
  { sel: '.topbar .speed', icon: '⏱', title: 'El tiempo corre solo', text: 'Pausa cuando quieras pensar (barra espaciadora).' },
  { sel: 'main.center', icon: '🌍', title: 'Otros países', text: 'Pulsa un país del mapa para comerciar, aliarte… o atacar.',
    before: (app) => { app.root.classList.remove('show-left'); },
    waitFor: (app) => !!app.selected && app.selected !== app.player?.id },
];

export function showTutorial(app: App, step = 0) {
  const s = STEPS[step];
  if (!s) return;
  s.before?.(app);
  app.modalOpen++;
  const spot = h('div', { class: 'coach-spot pulse' });
  const next = h('button', { class: 'btn primary' }, step < STEPS.length - 1 ? 'Siguiente ▶' : '¡A gobernar!');
  const tipEl = h('div', { class: 'coach-tip', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'c-ic', 'aria-hidden': 'true' }, s.icon),
    h('b', null, s.title), h('div', { style: 'margin-top:4px' }, s.text),
    h('div', { class: 'row' },
      h('span', { class: 'dots', 'aria-label': `Paso ${step + 1} de ${STEPS.length}` }, STEPS.map((_, i) => h('i', { class: i === step ? 'on' : '' }))),
      h('span', { class: 'row', style: 'margin:0;gap:6px' },
        h('button', { class: 'btn ghost sm', onclick: () => { done(); remember(); } }, 'Saltar'),
        s.waitFor ? h('span', { class: 'small muted' }, '👆 Pulsa uno…') : next)));
  document.body.append(spot, tipEl);
  let raf = 0, ended = false;
  const place = () => {
    const el = document.querySelector<HTMLElement>(typeof s.sel === 'function' ? s.sel() : s.sel);
    const r = el?.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (r && r.width > 0) {
      spot.style.display = 'block';
      Object.assign(spot.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
      // Junto al elemento: a la derecha si cabe; si no, debajo o encima
      let x = r.right + 14, y = r.top;
      if (x + tw > vw - 8) { x = Math.min(Math.max(8, r.left), vw - tw - 8); y = r.bottom + 12; if (y + th > vh - 8) y = Math.max(8, r.top - th - 12); }
      if (r.height > vh * 0.6 && x + tw <= vw - 8) y = Math.max(8, Math.min(r.top + 40, vh - th - 8));
      Object.assign(tipEl.style, { left: `${x}px`, top: `${Math.min(Math.max(8, y), vh - th - 8)}px` });
    } else {
      spot.style.display = 'none';
      Object.assign(tipEl.style, { left: `${Math.max(8, (vw - tipEl.offsetWidth) / 2)}px`, top: `${vh * 0.3}px` });
    }
    if (s.waitFor?.(app)) { done(); if (step < STEPS.length - 1) setTimeout(() => showTutorial(app, step + 1), 350); else { remember(); toast('¡Bien! Usa los botones grandes de su ficha para actuar sobre él.', 'good', 6000, '👏'); } return; }
    if (!ended) raf = requestAnimationFrame(place);
  };
  const done = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    spot.remove(); tipEl.remove();
    app.modalOpen = Math.max(0, app.modalOpen - 1);
  };
  next.addEventListener('click', () => {
    done();
    if (step < STEPS.length - 1) showTutorial(app, step + 1);
    else { remember(); app.root.classList.remove('show-left'); }
  });
  raf = requestAnimationFrame(place);
}

function remember() {
  try { localStorage.setItem(KEY, 'visto'); } catch { /* sin almacenamiento */ }
}

export function maybeShowTutorial(app: App) {
  let seen = false;
  try { seen = localStorage.getItem(KEY) === 'visto'; } catch { seen = false; }
  if (!seen && app.player) setTimeout(() => showTutorial(app, 0), 600);
}
