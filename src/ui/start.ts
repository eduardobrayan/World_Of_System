/** Pantalla de inicio: elección de país, dificultad, semilla y objetivo. */
import type { Country, Id, World } from '../sim/types';
import { createWorld, type NewGameOptions } from '../sim/init';
import { DATA, ideologyOf, regimeOf } from '../sim/data';
import { h, mount } from './dom';
import { MapView, type MapHost } from './map';
import { flagEl } from './flags';
import { fmtMoney, gdppc } from '../sim/util';
import { startExtras, objectiveOptions } from './startExtras';

export function randomSeed(): string {
  const words = ['atlas', 'boreal', 'cénit', 'delta', 'eclipse', 'fénix', 'granito', 'horizonte', 'iris', 'jade', 'kraken', 'lince', 'monzón', 'nébula', 'ópalo', 'prisma', 'quásar', 'rubí', 'sextante', 'tifón'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

const DIFFICULTY: Record<string, string> = {
  facil: 'Más capital político y una IA menos agresiva.',
  normal: 'Equilibrado: la experiencia prevista.',
  dificil: 'Menos capital político, IA más agresiva y eventos más duros.',
};

export function showStart(container: HTMLElement, onStart: (opts: NewGameOptions) => void, onLoad: (w: World) => void) {
  const preview = createWorld({ seed: 'vista-previa', player: null });
  const playable = new Set(DATA.countries.map((c) => c.id));
  let chosen: Id | null = 'ESP';
  let difficulty: 'facil' | 'normal' | 'dificil' = 'normal';
  let seed = randomSeed();
  let objective = 'libre';

  const canvas = h('canvas', { 'aria-label': 'Mapa: elige país' });
  const hover = h('div', { class: 'hover-card' });
  const side = h('div', { class: 'side' });
  const root = h('div', { class: 'start' }, h('div', { class: 'map-pane' }, canvas, hover), side);
  mount(container, root);

  const host: MapHost = {
    world: preview, player: null, selected: chosen, selectedRegion: null, layer: 'politico', localLayer: 'development', view: 'world', localId: null,
    onSelect: (id) => { if (id && playable.has(id)) { chosen = id; host.selected = id; renderSide(); map.invalidate(); } },
    onSelectRegion: () => undefined,
    onOpenLocal: (id) => host.onSelect(id),
    onHover: (el, x, y) => {
      if (!el) { hover.style.display = 'none'; return; }
      mount(hover, el);
      hover.style.display = 'block';
      hover.style.left = `${x + 14}px`;
      hover.style.top = `${y + 14}px`;
    },
    hoverInfo: (id) => {
      const c = preview.countries[id];
      return h('div', null, h('div', { class: 'row' }, flagEl(c, 18, 12), h('b', null, c.name)),
        h('div', { class: 'small ink2' }, playable.has(id) ? 'Jugable — clic para elegir' : 'Bloque regional (controlado por la IA)'));
    },
    regionHoverInfo: () => h('div'),
  };
  const map = new MapView(canvas, host);
  requestAnimationFrame(() => map.fitWorld());

  const renderSide = () => {
    const c: Country | null = chosen ? preview.countries[chosen] : null;
    mount(side,
      h('h1', null, '🌐 World of System'),
      h('div', { class: 'tagline' }, 'Simulador geopolítico por turnos. Dirige un país desde enero de 2026: economía, política, diplomacia, guerra e inteligencia, con consecuencias en cadena.'),
      h('div', { class: 'field' }, h('span', null, 'País (clic en el mapa o en la lista)'),
        h('div', { class: 'country-list' }, DATA.countries.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((rc) =>
          h('button', { class: rc.id === chosen ? 'on' : '', onclick: () => host.onSelect(rc.id) }, flagEl(preview.countries[rc.id], 18, 12), rc.name)))),
      c ? h('div', { class: 'card' },
        h('div', { class: 'row' }, flagEl(c, 34, 22), h('div', null, h('h3', { style: 'margin:0' }, c.name), h('div', { class: 'small ink2' }, `${regimeOf(c.pol.regime).name} · ${ideologyOf(c.pol.ideology).name}`))),
        h('div', { class: 'grid2 small', style: 'margin-top:6px' },
          h('div', null, `PIB: ${fmtMoney(c.eco.gdp)}`), h('div', null, `Renta: ${Math.round(gdppc(c)).toLocaleString('es-ES')} $`),
          h('div', null, `Población: ${c.soc.pop.toFixed(1)} M`), h('div', null, `Crecimiento: ${c.eco.growth.toFixed(1)} %`),
          h('div', null, `Inflación: ${c.eco.inflation.toFixed(1)} %`), h('div', null, `Deuda: ${((c.eco.debt / c.eco.gdp) * 100).toFixed(0)} %`),
          h('div', null, `Aprobación: ${c.pol.approval.toFixed(0)}`), h('div', null, `Estabilidad: ${c.pol.stability.toFixed(0)}`)),
        h('div', { class: 'small muted', style: 'margin-top:6px' }, difficultyHint(c))) : null,
      h('div', { class: 'field' }, h('span', null, 'Dificultad'),
        h('div', { class: 'seg' }, (['facil', 'normal', 'dificil'] as const).map((d) => h('button', { class: d === difficulty ? 'on' : '', onclick: () => { difficulty = d; renderSide(); } }, { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' }[d]))),
        h('span', { class: 'small muted' }, DIFFICULTY[difficulty])),
      h('div', { class: 'field' }, h('span', null, 'Objetivo'),
        (() => {
          const sel = h('select', { onchange: (e: Event) => { objective = (e.target as HTMLSelectElement).value; renderSide(); } },
            objectiveOptions().map(([id, name]) => h('option', { value: id, selected: id === objective }, name)));
          return sel;
        })(),
        h('span', { class: 'small muted' }, objectiveOptions().find(([id]) => id === objective)?.[2] ?? '')),
      h('div', { class: 'field' }, h('span', null, 'Semilla (misma semilla = mismo mundo)'),
        h('div', { class: 'row' }, (() => {
          const inp = h('input', { type: 'text', value: seed, class: 'grow', 'aria-label': 'Semilla' });
          inp.addEventListener('input', () => { seed = inp.value; });
          return inp;
        })(), h('button', { class: 'btn', title: 'Semilla aleatoria', onclick: () => { seed = randomSeed(); renderSide(); } }, '🎲'))),
      h('div', { class: 'row wrap', style: 'margin-top:12px' },
        h('button', { class: 'btn primary', disabled: !chosen, onclick: () => { map.destroy(); onStart({ seed: seed || randomSeed(), player: chosen, difficulty, objective }); } }, '▶ Comenzar partida'),
        h('button', { class: 'btn', onclick: () => { map.destroy(); onStart({ seed: seed || randomSeed(), player: null }); } }, '👁 Observar el mundo')),
      ...startExtras((w) => { map.destroy(); onLoad(w); }),
      h('p', { class: 'small muted', style: 'margin-top:16px' }, 'Datos aproximados de 2026. Mapa: Natural Earth 110m. Los nombres de ministros son ficticios.'));
  };
  renderSide();
}

function difficultyHint(c: Country): string {
  const notes: string[] = [];
  if (c.pol.stability < 40) notes.push('país inestable');
  if (c.eco.inflation > 15) notes.push('inflación alta');
  if ((c.eco.debt / c.eco.gdp) * 100 > 110) notes.push('deuda elevada');
  if (c.eco.deficit > 6) notes.push('déficit alto');
  if (c.pol.approval < 35) notes.push('gobierno impopular');
  if (c.mil.mobilization > 0) notes.push('en guerra');
  if (c.eco.gdp > 3000) notes.push('gran potencia');
  return notes.length ? `Situación de partida: ${notes.join(', ')}.` : 'Situación de partida relativamente estable.';
}
