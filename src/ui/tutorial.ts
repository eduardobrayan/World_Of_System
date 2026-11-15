/**
 * Guía interactiva de los primeros minutos: resalta dónde mirar o hacer clic, con frases cortas.
 * Algunos pasos esperan a que el jugador haga algo (p. ej. elegir un país en el mapa).
 * El reloj se detiene mientras dura la guía.
 */
import type { App } from './app';
import { h } from './dom';

interface Step {
  sel: string; // elemento que se resalta
  title: string;
  text: string;
  before?: (app: App) => void;
  waitFor?: (app: App) => boolean; // el paso avanza solo cuando se cumple
}

const KEY = 'wos:guia';

const STEPS: Step[] = [
  { sel: '.cmd-gauges', title: 'Tu panel de mando', text: 'Seis medidores: verde va bien, amarillo regular, rojo mal. La flecha dice si sube o baja. Pulsa uno y verás qué puedes hacer.',
    before: (app) => { app.setTab('mando'); } },
  { sel: '.advisors', title: 'Tus consejeros', text: 'Te dicen lo más urgente. Pulsa su botón y actúas en un clic.' },
  { sel: '.dock', title: 'Tus acciones', text: 'Todo lo que puedes hacer está aquí, por temas. Con 🔎 buscas cualquier cosa escribiendo una palabra.',
    before: (app) => { app.root.classList.remove('show-left'); } },
  { sel: '.topbar .speed', title: 'El tiempo corre solo', text: 'Barra espaciadora: pausa. Teclas 1, 2 y 3: velocidad.' },
  { sel: 'main.center', title: 'Elige un país', text: 'Haz clic en cualquier país del mapa (no el tuyo).',
    before: (app) => { app.root.classList.remove('show-left'); },
    waitFor: (app) => !!app.selected && app.selected !== app.player?.id },
  { sel: '.quick-actions', title: 'Actúa sobre él', text: 'Comerciar, aliarte, ayudar, sancionar, espiar o atacar. Verás el efecto en el mapa.',
    before: (app) => { app.root.classList.add('show-right'); app.root.classList.remove('right-collapsed'); } },
  { sel: 'nav.tabs-v', title: 'Todo lo demás', text: 'Aquí está el detalle, en cinco secciones: gobierno, sociedad, mundo, ejército y tecnología.',
    before: (app) => { app.root.classList.remove('show-right'); app.root.classList.add('show-left'); } },
];

export function showTutorial(app: App, step = 0) {
  const s = STEPS[step];
  if (!s) return;
  s.before?.(app);
  app.modalOpen++;
  const spot = h('div', { class: 'coach-spot pulse' });
  const next = h('button', { class: 'btn primary sm' }, step < STEPS.length - 1 ? 'Siguiente ▶' : '¡A gobernar!');
  const tipEl = h('div', { class: 'coach-tip', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'k' }, `Guía ${step + 1}/${STEPS.length}`),
    h('b', null, s.title), h('div', { style: 'margin-top:4px' }, s.text),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost sm', onclick: () => { done(); remember(); } }, 'Saltar'),
      s.waitFor ? h('span', { class: 'small muted' }, 'Esperando tu clic…') : next));
  document.body.append(spot, tipEl);
  let raf = 0, ended = false;
  const place = () => {
    const el = document.querySelector<HTMLElement>(s.sel);
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
    if (s.waitFor?.(app)) { done(); setTimeout(() => showTutorial(app, step + 1), 350); return; }
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
