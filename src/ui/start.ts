/** Pantalla de inicio: elección de país, dificultad, semilla y objetivo. */
import type { Country, Id, World } from '../sim/types';
import { createWorld, type NewGameOptions } from '../sim/init';
import { DATA, ideologyOf, regimeOf } from '../sim/data';
import { h, mount } from './dom';
import { MapView, type MapHost } from './map';
import { flagEl } from './flags';
import { gdppc } from '../sim/util';
import { startExtras, objectiveOptions, continueButton } from './startExtras';

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
  let partyMode: 'gov' | 'existing' | 'new' = 'gov';
  let partyName = '';
  const newParty = { name: '', ideology: 'socialdemocracia', leader: '' };

  const canvas = h('canvas', { 'aria-label': 'Mapa: elige país' });
  const hover = h('div', { class: 'hover-card' });
  const side = h('div', { class: 'side' });
  const brand = h('div', { class: 'brand' }, h('h1', null, '🌐 World of System'), h('div', { class: 'tagline' }, 'Dirige un país real desde 2026.'));
  const root = h('div', { class: 'start' }, h('div', { class: 'map-pane' }, canvas, hover, brand), side);
  let query = '';
  let fromMap = true; // al abrir, la lista muestra el país elegido
  mount(container, root);

  const host: MapHost = {
    world: preview, player: null, selected: chosen, selectedRegion: null, layer: 'politico', localLayer: 'development', view: 'world', localId: null,
    onSelect: (id) => { if (id && playable.has(id)) { if (id !== chosen) { partyMode = 'gov'; partyName = ''; } chosen = id; host.selected = id; fromMap = true; renderSide(); map.invalidate(); } },
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
        h('div', { class: 'small ink2' }, playable.has(id) ? '👆 Pulsa para elegirlo' : 'Bloque regional (lo mueve la IA)'));
    },
    regionHoverInfo: () => h('div'),
  };
  const map = new MapView(canvas, host);
  requestAnimationFrame(() => map.fitWorld());

  const start = (player: Id | null) => { map.destroy(); onStart(player ? { seed: seed || randomSeed(), player, difficulty, objective, party: partyOption() } : { seed: seed || randomSeed(), player: null }); };

  const renderSide = () => {
    const c: Country | null = chosen ? preview.countries[chosen] : null;
    const oldScroll = side.querySelector('.side-scroll')?.scrollTop ?? 0;
    const oldList = side.querySelector('.country-list')?.scrollTop ?? 0;
    // Paso 1: país (cuadrícula de banderas con buscador)
    const list = h('div', { class: 'country-list', role: 'listbox', 'aria-label': 'Países' }, DATA.countries.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((rc) =>
      h('button', { class: rc.id === chosen ? 'on' : '', role: 'option', 'aria-selected': String(rc.id === chosen), 'data-name': norm(rc.name), onclick: () => host.onSelect(rc.id) },
        flagEl(preview.countries[rc.id], 40, 27), h('span', { class: 'cn' }, rc.name))));
    const filter = () => { for (const b of list.querySelectorAll<HTMLElement>('button')) b.style.display = !query || b.dataset.name!.includes(norm(query)) ? '' : 'none'; };
    const search = h('input', { type: 'search', class: 'country-search', placeholder: '🔎 Buscar país…', 'aria-label': 'Buscar país', value: query });
    search.addEventListener('input', () => { query = search.value; filter(); });
    filter();
    const diff = c ? countryDifficulty(c) : null;
    const opts = h('details', { class: 'opts', open: app_opts.open ? '' : undefined },
      h('summary', null, '⚙️ Opciones', h('span', { class: 'small muted', style: 'font-weight:500' }, `${{ facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' }[difficulty]} · ${objectiveOptions().find(([id]) => id === objective)?.[1] ?? ''}`)),
      h('div', { class: 'field' }, h('span', null, 'Dificultad'),
        h('div', { class: 'seg' }, (['facil', 'normal', 'dificil'] as const).map((d) => h('button', { class: d === difficulty ? 'on' : '', onclick: () => { difficulty = d; renderSide(); } }, { facil: '🙂 Fácil', normal: '😐 Normal', dificil: '😬 Difícil' }[d]))),
        h('span', { class: 'small muted' }, DIFFICULTY[difficulty])),
      h('div', { class: 'field' }, h('span', null, 'Objetivo'),
        h('select', { 'aria-label': 'Objetivo', onchange: (e: Event) => { objective = (e.target as HTMLSelectElement).value; renderSide(); } },
          objectiveOptions().map(([id, name]) => h('option', { value: id, selected: id === objective }, name))),
        h('span', { class: 'small muted' }, objectiveOptions().find(([id]) => id === objective)?.[2] ?? '')),
      h('div', { class: 'field' }, h('span', null, 'Semilla (misma semilla = mismo mundo)'),
        h('div', { class: 'row' }, (() => {
          const inp = h('input', { type: 'text', value: seed, class: 'grow', 'aria-label': 'Semilla' });
          inp.addEventListener('input', () => { seed = inp.value; });
          return inp;
        })(), h('button', { class: 'btn', title: 'Semilla aleatoria', 'aria-label': 'Semilla aleatoria', onclick: () => { seed = randomSeed(); renderSide(); } }, '🎲'))),
      ...startExtras((w) => { map.destroy(); onLoad(w); }),
      h('button', { class: 'btn sm', style: 'margin-bottom:14px', onclick: () => start(null) }, '👁 Solo mirar el mundo (sin país)'),
      h('p', { class: 'small muted' }, 'Datos aproximados de 2026. Mapa: Natural Earth. Los nombres de ministros son ficticios.'));
    opts.addEventListener('toggle', () => { app_opts.open = (opts as HTMLDetailsElement).open; });
    const scroll = h('div', { class: 'side-scroll' },
      continueButton((w) => { map.destroy(); onLoad(w); }),
      h('div', { class: 'step-box' },
        h('div', { class: 'step-h' }, h('span', { class: 'step-n' }, '1'), 'Elige tu país'),
        search, list,
        c && diff ? h('div', { class: 'pick-card' },
          h('div', { class: 'pc-head' }, flagEl(c, 60, 40),
            h('div', { class: 'grow' }, h('h3', null, c.name), h('div', { class: 'small ink2' }, regimeOf(c.pol.regime).name)),
            h('span', { class: `diff-tag ${diff[0]}`, title: diff[2] }, diff[1])),
          h('div', { class: 'pick-facts' },
            fact('💰', `${Math.round(gdppc(c) / 1000)} mil $`, 'renta por persona'),
            fact('👥', `${c.soc.pop >= 10 ? c.soc.pop.toFixed(0) : c.soc.pop.toFixed(1)} M`, 'habitantes'),
            fact(c.pol.approval >= 50 ? '👍' : '👎', `${c.pol.approval.toFixed(0)} %`, 'te apoya')),
          h('div', { class: 'small muted' }, diff[2])) : null),
      c ? h('div', { class: 'step-box' }, h('div', { class: 'step-h' }, h('span', { class: 'step-n' }, '2'), 'Elige tu partido'), partyPicker(c)) : null,
      opts);
    const foot = h('div', { class: 'side-foot' },
      h('button', { class: 'btn primary big', 'data-start': '1', disabled: !chosen, onclick: () => start(chosen) },
        h('span', { class: 'step-n', style: 'background:rgba(255,255,255,.22)' }, '3'), c ? `Jugar con ${c.short}` : 'Jugar', ' ▶'));
    mount(side, scroll, foot);
    scroll.scrollTop = oldScroll;
    list.scrollTop = oldList;
    if (fromMap) { fromMap = false; list.querySelector<HTMLElement>('button.on')?.scrollIntoView({ block: 'nearest' }); }
  };
  const partyOption = (): NewGameOptions['party'] => {
    if (partyMode === 'existing' && partyName) return { mode: 'existing', name: partyName };
    if (partyMode === 'new') return { mode: 'new', name: newParty.name || 'Nuevo Movimiento', ideology: newParty.ideology, color: DATA.ideologies[newParty.ideology]?.color, leader: newParty.leader };
    return { mode: 'gov' };
  };

  function partyPicker(c: Country): HTMLElement {
    const gov = c.pol.parties.find((p) => p.gov);
    const comp = regimeOf(c.pol.regime).elections;
    const opt = (on: boolean, color: string, title: string, sub: string, click: () => void) =>
      h('button', { class: `option ${on ? 'on' : ''}`, 'aria-pressed': String(on), onclick: () => { click(); renderSide(); } },
        h('span', { class: 'party-dot', style: `background:${color}` }), h('span', { class: 'p-tx' }, h('b', null, title), h('span', { class: 'small ink2' }, sub)),
        on ? h('span', { style: 'margin-left:auto;color:var(--accent-2);font-size:18px' }, '✔') : null);
    const nameInp = h('input', { type: 'text', value: newParty.name, placeholder: 'Nombre del partido', maxlength: '50', 'aria-label': 'Nombre del nuevo partido' });
    nameInp.addEventListener('input', () => { newParty.name = nameInp.value; });
    const leaderInp = h('input', { type: 'text', value: newParty.leader, placeholder: 'Tu nombre como líder (opcional)', maxlength: '40', 'aria-label': 'Nombre del líder' });
    leaderInp.addEventListener('input', () => { newParty.leader = leaderInp.value; });
    return h('div', { class: 'field' },
      h('div', { class: 'party-list' },
        opt(partyMode === 'gov', ideologyOf(gov?.ideology ?? c.pol.ideology).color, gov?.name ?? 'Gobierno actual', `Gobierna ahora · ${ideologyOf(c.pol.ideology).name}`, () => { partyMode = 'gov'; }),
        ...c.pol.parties.filter((p) => !p.gov).map((p) => opt(partyMode === 'existing' && partyName === p.name, ideologyOf(p.ideology).color, p.name,
          `${ideologyOf(p.ideology).name} · ${comp ? 'gana las elecciones' : 'toma el poder'}`, () => { partyMode = 'existing'; partyName = p.name; })),
        opt(partyMode === 'new', DATA.ideologies[newParty.ideology]?.color ?? '#888', '✚ Crear mi propio partido', 'Tú eliges nombre e ideas', () => { partyMode = 'new'; })),
      partyMode === 'new' ? h('div', { class: 'card col', style: 'margin-top:6px' },
        nameInp,
        h('select', { 'aria-label': 'Ideología', onchange: (e: Event) => { newParty.ideology = (e.target as HTMLSelectElement).value; renderSide(); } },
          Object.entries(DATA.ideologies).map(([id, ideo]) => h('option', { value: id, selected: id === newParty.ideology }, ideo.name))),
        h('div', { class: 'small muted' }, ideologyDesc(newParty.ideology)),
        leaderInp) : null);
  }

  renderSide();
}

function ideologyDesc(id: string): string {
  const i = ideologyOf(id);
  const econ = i.econ < -0.3 ? 'izquierda económica' : i.econ > 0.3 ? 'derecha económica' : 'centro económico';
  const auth = i.auth > 0.3 ? 'autoritaria' : i.auth < -0.3 ? 'libertaria' : 'moderada';
  return `${econ}, ${auth}${i.nat > 0.5 ? ', nacionalista' : ''}${i.relig > 0.5 ? ', religiosa' : ''}.`;
}

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const app_opts = { open: false };

function fact(icon: string, value: string, label: string): HTMLElement {
  return h('div', { class: 'fact' }, h('span', { class: 'f-ic' }, icon), h('span', { class: 'f-v' }, value), h('span', { class: 'f-k' }, label));
}

/** Dificultad del país al empezar: [clase CSS, etiqueta, motivo en una línea]. */
function countryDifficulty(c: Country): [string, string, string] {
  const notes: string[] = [];
  if (c.pol.stability < 40) notes.push('país inestable');
  if (c.eco.inflation > 15) notes.push('inflación alta');
  if ((c.eco.debt / c.eco.gdp) * 100 > 110) notes.push('mucha deuda');
  if (c.eco.deficit > 6) notes.push('gasta de más');
  if (c.pol.approval < 35) notes.push('gobierno impopular');
  if (c.mil.mobilization > 0) notes.push('en guerra');
  const why = notes.length ? `Al empezar: ${notes.join(', ')}.` : 'Empiezas con un país estable.';
  const hard = notes.length >= 3 || c.mil.mobilization > 0 || c.pol.stability < 30;
  return hard ? ['hard', '😬 Difícil', why] : notes.length ? ['mid', '😐 Normal', why] : ['easy', '🙂 Fácil', why];
}
