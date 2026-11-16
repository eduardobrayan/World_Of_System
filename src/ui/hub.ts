/**
 * Centro de acciones: todo lo que puede hacer el jugador, a dos clics y sin buscar por pestañas.
 *  - Rejilla de objetivos con icono grande («¿Qué quieres hacer?»).
 *  - Cada objetivo abre un catálogo de tarjetas: nombre, frase corta, efectos en verde/rojo y coste.
 *  - Buscador: escribe «paro», «policía», «armas»… y aparecen las acciones que encajan.
 */
import type { App } from './app';
import type { ActionDef, Contribution, Country } from '../sim/types';
import { h, modal, mount } from './dom';
import { ACTIONS, ACTION_BY_ID, previewAction } from '../sim/actions';
import { actionIcon, effectPill, openAction } from './actionui';
import { missionRecIds } from '../sim/missions';

interface Link { icon: string; name: string; text: string; run: (app: App) => void; words?: string }
export interface Goal { id: string; icon: string; name: string; hint: string; color: string; actions: string[]; links?: Link[]; explain?: string; words: string }

const go = (tab: string) => (app: App) => app.setTab(tab);

export const GOALS: Goal[] = [
  { id: 'economia', icon: '💰', name: 'Economía', hint: 'Crecer, empleo, precios', color: '#e0a92a', explain: 'growth', words: 'dinero paro empleo inflación precios impuestos deuda déficit crecimiento',
    actions: ['estimulo', 'austeridad', 'rebaja_fiscal', 'reforma_fiscal_progresiva', 'plan_industrial', 'lucha_fraude', 'control_precios', 'empleo_juvenil', 'reforma_laboral', 'privatizaciones', 'nacionalizacion', 'digitalizacion'],
    links: [{ icon: '🧾', name: 'Presupuesto e impuestos', text: 'Reparte el gasto y fija los impuestos.', run: go('economia'), words: 'presupuesto impuestos gasto iva' },
      { icon: '📈', name: 'Mercado mundial', text: 'Precios del petróleo, gas, alimentos…', run: go('mercado'), words: 'petróleo gas precios comercio' }] },
  { id: 'bienestar', icon: '😊', name: 'Bienestar', hint: 'Sanidad, vivienda, pensiones', color: '#2fae4e', explain: 'satisfaction', words: 'gente felicidad sanidad hospital educación escuela vivienda pensiones necesidades comida energía',
    actions: ['plan_sanitario', 'refuerzo_sanitario', 'plan_educacion', 'ley_vivienda', 'renta_basica', 'reforma_pensiones', 'subsidio_combustible', 'tratamiento_adicciones', 'integracion_inmigrantes', 'ley_igualdad', 'transicion_energetica'],
    links: [{ icon: '🍞', name: 'Necesidades de la gente', text: 'Qué le falta a tu población y por qué.', run: go('sociedad'), words: 'necesidades presión social grupos' },
      { icon: '🏗', name: 'Construir en tu territorio', text: 'Hospitales, carreteras, fábricas…', run: (app) => { if (app.player) app.onOpenLocal(app.player.id); }, words: 'construir edificios regiones hospital carretera puerto fábrica universidad' }] },
  { id: 'politica', icon: '🏛', name: 'Política', hint: 'Apoyos, leyes, elecciones', color: '#3987e5', explain: 'stability', words: 'gobierno estabilidad aprobación elecciones protestas ministros leyes golpe parlamento',
    actions: ['dialogo_social', 'campana_comunicacion', 'referendum', 'elecciones_anticipadas', 'concesiones_militares', 'amnistia', 'estado_emergencia', 'reprimir_protestas', 'purga_militar', 'reforma_constitucional', 'apertura_democratica', 'clientelismo', 'manipular_elecciones'],
    links: [{ icon: '👔', name: 'Ministros y políticas', text: 'Cambia ministros y el rumbo del país.', run: go('gobierno'), words: 'ministros políticas banco central servicio militar' },
      { icon: '🎯', name: 'Tus misiones y tu rango', text: 'Qué toca ahora y cuánto llevas.', run: go('objetivos'), words: 'objetivo ganar victoria misión misiones rango prestigio mandato' }] },
  { id: 'seguridad', icon: '🚓', name: 'Policía', hint: 'Delincuencia y orden', color: '#5598e7', explain: 'crime', words: 'policía crimen delincuencia seguridad agentes',
    actions: ['reclutar_policias', 'formacion_policial', 'depuracion_policial', 'policia_comunitaria', 'militarizar_policia', 'ley_seguridad'],
    links: [{ icon: '📋', name: 'Informe de seguridad', text: 'Policía, corrupción y narco al detalle.', run: go('seguridad') }] },
  { id: 'corrupcion', icon: '💼', name: 'Corrupción', hint: 'Sobornos y escándalos', color: '#c98500', words: 'corrupción sobornos jueces fraude escándalo transparencia',
    actions: ['ley_anticorrupcion', 'fiscalia_anticorrupcion', 'reforma_judicial', 'administracion_digital', 'autoridad_electoral', 'lucha_blanqueo', 'campana_anticorrupcion'] },
  { id: 'narco', icon: '💀', name: 'Narcotráfico', hint: 'Cárteles y drogas', color: '#d95926', words: 'narco cárteles droga cocaína violencia cannabis',
    actions: ['ofensiva_antinarco', 'sustitucion_cultivos', 'legalizar_cannabis', 'lucha_blanqueo', 'tratamiento_adicciones', 'negociar_carteles'] },
  { id: 'ejercito', icon: '🎖', name: 'Ejército', hint: 'Tropas, guerra y paz', color: '#d64545', words: 'ejército guerra tropas tanques movilizar nuclear soldados paz unidades',
    actions: ['movilizar', 'desmovilizar', 'programa_nuclear', 'alerta_nuclear', 'bajar_alerta'],
    links: [{ icon: '🪖', name: 'Fuerzas y guerras', text: 'Encarga unidades, doctrina y frentes.', run: go('militar'), words: 'unidades encargar doctrina frentes' },
      { icon: '🛠', name: 'Diseñar o comprar armas', text: 'Cazas, drones, carros, submarinos…', run: go('armamento'), words: 'armas armamento diseñar comprar caza dron carro submarino' }] },
  { id: 'bio', icon: '☣', name: 'Biológico', hint: 'Escudo y patógenos', color: '#9085e9', words: 'biológico virus patógeno pandemia vacuna laboratorio brote',
    actions: ['defensa_biologica'],
    links: [{ icon: '🧫', name: 'Laboratorio secreto', text: 'Programa de armas biológicas y cepas.', run: go('armamento'), words: 'cepa patógeno programa secreto liberar' }] },
  { id: 'mundo', icon: '🌍', name: 'Otros países', hint: 'Pactos, sanciones, espías', color: '#199e70', words: 'diplomacia alianza comercio sanciones espiar países tratado ayuda onu',
    actions: ['contraespionaje', 'servicios_inteligencia'],
    links: [{ icon: '👆', name: 'Elige un país en el mapa', text: 'Pulsa cualquier país: comerciar, aliarte, sancionar, espiar o atacar.', run: (app) => app.root.classList.remove('show-left'), words: 'comerciar aliarse sancionar atacar espiar' },
      { icon: '🤝', name: 'Tus tratados y organismos', text: 'Alianzas, acuerdos, ONU.', run: go('diplomacia'), words: 'tratados organismos onu otan' },
      { icon: '🕵', name: 'Espionaje en marcha', text: 'Operaciones y redes de agentes.', run: go('inteligencia'), words: 'operaciones agentes espionaje' },
      { icon: '📰', name: 'Qué pasa en el mundo', text: 'Noticias y decisiones de otros países.', run: go('mundo'), words: 'noticias mundo' }] },
  { id: 'ciencia', icon: '🔬', name: 'Ciencia', hint: 'Elige qué investigar', color: '#008300', words: 'tecnología investigar ciencia ia energía espacio', actions: [],
    links: [{ icon: '🔬', name: 'Árbol de tecnologías', text: 'Industria, energía, medicina, IA, espacio…', run: go('tecnologia') }] },
];

/** Acciones internas sin objetivo asignado: van a «Política» para que nada quede escondido. */
const assigned = new Set(GOALS.flatMap((g) => g.actions));
for (const a of ACTIONS) {
  if (a.hidden || a.target !== 'none' || assigned.has(a.id)) continue;
  if (['ley', 'economia', 'social', 'gobierno', 'seguridad'].includes(a.category)) GOALS.find((g) => g.id === 'politica')!.actions.push(a.id);
}

function firstSentence(s: string): string {
  const i = s.search(/[.:;]/);
  const t = i > 20 ? s.slice(0, i) : s;
  return t.length > 90 ? `${t.slice(0, 88)}…` : t;
}

/** Tarjeta visual de una acción: nombre, frase corta, efectos principales y coste. */
export function actionCard(app: App, c: Country, def: ActionDef, icon: string, onPick?: () => void, color?: string, star = false): HTMLElement {
  const pv = previewAction(app.world, def, { actor: c });
  const done = !!(def.params?.law && c.pol.flags[def.id]);
  const chips = pv.lines.filter((l) => !l.hidden && l.good !== undefined).slice(0, 3).map((l) => effectPill(l, true));
  const why = done ? 'Ya está en vigor' : pv.unmet[0];
  return h('button', { class: `acard ${done ? 'done' : pv.ok ? '' : 'off'} ${star && !done ? 'star' : ''}`, title: def.desc, 'data-action': def.id, onclick: () => { onPick?.(); openAction(app, def, {}); } },
    star && !done ? h('span', { class: 'ac-star' }, '⭐ Para tu misión') : null,
    h('span', { class: 'ac-ic', style: `--gc:${color ?? '#9aa4b2'}` }, done ? '✅' : actionIcon(def) || icon),
    h('span', { class: 'ac-body' },
      h('b', null, def.name),
      h('span', { class: 'ac-desc' }, firstSentence(def.desc))),
    h('span', { class: 'ac-cost' }, done ? '' : h('span', { class: 'apc' }, `⚡${pv.ap}`), pv.money > 0.05 && !done ? h('small', null, `💰 ${pv.money.toFixed(1)}`) : null),
    chips.length || why ? h('span', { class: 'ac-foot' },
      chips.length ? h('span', { class: 'ac-chips' }, chips) : null,
      why ? h('span', { class: 'ac-why' }, `🔒 ${why}`) : null) : null);
}

function linkCard(app: App, l: Link, onPick?: () => void): HTMLElement {
  return h('button', { class: 'alink', title: l.text, onclick: () => { onPick?.(); l.run(app); } },
    h('span', { class: 'al-ic' }, l.icon), h('span', { class: 'al-tx' }, h('b', null, l.name), h('span', null, l.text)), h('span', { class: 'al-go' }, '›'));
}

function causes(parts: Contribution[] | undefined): HTMLElement | null {
  if (!parts?.length) return null;
  const top = parts.filter((p) => !/inicial|calibra|estructural|potencial/i.test(p.label)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 4);
  if (!top.length) return null;
  return h('div', { class: 'causes' }, h('span', { class: 'small muted', style: 'margin-right:4px' }, '🔍 Lo que más influye ahora:'),
    top.map((p) => h('span', { class: `chip ${p.value >= 0 ? 'good' : 'bad'}` }, `${p.value >= 0 ? '▲' : '▼'} ${p.label}`)));
}

/** Abre el catálogo de un objetivo. Las acciones que sirven a la misión en curso van primero y con ⭐. */
export function openGoal(app: App, id: string, rec: Set<string> = new Set(missionRecIds(app.world))) {
  const c = app.player;
  const g = GOALS.find((x) => x.id === id);
  if (!c || !g) return;
  app.modalOpen++;
  let close = () => undefined as void;
  const pick = () => close();
  const defs = g.actions.map((a) => ACTION_BY_ID[a]).filter((d) => d && (!d.regimes || d.regimes.includes(c.pol.regime)));
  const ok = (d: ActionDef) => (previewAction(app.world, d, { actor: c }).ok ? 0 : c.pol.flags[d.id] ? 2 : 1);
  // Con ⭐ solo lo que se puede hacer ya; entre ellas, primero las que el parlamento aprobará con más facilidad
  const starred = (d: ActionDef) => rec.has(d.id) && ok(d) === 0;
  const odds = (d: ActionDef) => previewAction(app.world, d, { actor: c }).vote?.prob ?? 1;
  defs.sort((a, b) => Number(starred(b)) - Number(starred(a)) || (starred(a) && starred(b) ? odds(b) - odds(a) : 0) || ok(a) - ok(b));
  const body = h('div', null,
    g.explain === 'crime' ? null : causes(g.explain ? c.explain[g.explain] : undefined),
    g.links?.length ? h('div', { class: 'alinks' }, g.links.map((l) => linkCard(app, l, pick))) : null,
    h('div', { class: 'acards' }, defs.map((d) => actionCard(app, c, d, g.icon, pick, g.color, starred(d)))),
    h('div', { class: 'cat-foot' }, `⚡ Tienes ${c.pol.ap.toFixed(1)} de capital político · pulsa una tarjeta para ver qué pasará antes de hacerlo.`));
  close = modal({ title: g.name, kicker: g.hint, icon: g.icon, body, wide: true, footer: null, onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); } });
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Bloque del panel de mando: buscador + rejilla de objetivos. */
export function hubEl(app: App, onPick?: () => void): HTMLElement {
  const c = app.player!;
  const results = h('div', { class: 'acards' });
  const grid = h('div', { class: 'goal-grid' }, GOALS.map((g) => h('button', { class: 'goal', style: `--gc:${g.color}`, 'data-goal': g.id, onclick: () => { onPick?.(); openGoal(app, g.id); } },
    h('span', { class: 'goal-ic' }, g.icon), h('b', null, g.name), h('span', { class: 'goal-hint' }, g.hint))));
  const inp = h('input', { type: 'search', class: 'hub-search', placeholder: 'Escribe: paro, policía, armas, vivienda…', 'aria-label': 'Buscar acciones', value: String(app.ui.hubQuery ?? '') });
  const run = () => {
    const q = norm(inp.value.trim());
    app.ui.hubQuery = inp.value;
    if (q.length < 2) { mount(results); grid.style.display = ''; return; }
    grid.style.display = 'none';
    const cards: HTMLElement[] = [];
    const seen = new Set<string>();
    for (const g of GOALS) {
      const gHit = norm(`${g.name} ${g.words}`).includes(q);
      for (const l of g.links ?? []) if (gHit || norm(`${l.name} ${l.text} ${l.words ?? ''}`).includes(q)) cards.push(linkCard(app, l, onPick));
      for (const id of g.actions) {
        const d = ACTION_BY_ID[id];
        if (!d || seen.has(id) || (d.regimes && !d.regimes.includes(c.pol.regime))) continue;
        if (gHit || norm(`${d.name} ${d.desc}`).includes(q)) { seen.add(id); cards.push(actionCard(app, c, d, g.icon, onPick, g.color)); }
      }
    }
    mount(results, cards.length ? cards.slice(0, 14) : h('div', { class: 'small muted' }, 'Nada con ese nombre. Prueba otra palabra o pulsa un país en el mapa.'));
  };
  inp.addEventListener('input', run);
  run();
  return h('div', { class: 'hub' }, inp, grid, results);
}

/** Buscador de acciones en una ventana. */
export function openSearch(app: App) {
  if (!app.player) return;
  app.modalOpen++;
  let close = () => undefined as void;
  app.ui.hubQuery = '';
  const body = hubEl(app, () => close());
  close = modal({ title: '¿Qué quieres hacer?', kicker: 'Escribe una palabra o elige un tema', icon: '🔎', body, wide: true, footer: null, onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); } });
  (body.querySelector('.hub-search') as HTMLInputElement | null)?.focus();
}

const SHORT: Record<string, string> = { narco: 'Narco', mundo: 'Países', corrupcion: 'Corrupción', bio: 'Biológico' };

/** Barra de acciones siempre visible bajo el mapa: un botón grande por tema. */
export function dockEl(app: App): HTMLElement | null {
  if (!app.player) return null;
  return h('div', { class: 'dock', role: 'toolbar', 'aria-label': 'Acciones' },
    h('button', { class: 'dock-btn search', style: '--gc:#9aa4b2', title: 'Buscar cualquier acción (tecla B)', onclick: () => openSearch(app) }, h('span', { class: 'dock-ic' }, '🔎'), h('span', { class: 'd-lbl' }, 'Buscar')),
    h('span', { class: 'dock-sep', 'aria-hidden': 'true' }),
    GOALS.map((g) => h('button', { class: 'dock-btn', style: `--gc:${g.color}`, title: `${g.name}: ${g.hint}`, 'data-goal': g.id, onclick: () => openGoal(app, g.id) },
      h('span', { class: 'dock-ic' }, g.icon), h('span', { class: 'd-lbl' }, SHORT[g.id] ?? g.name))),
    h('button', { class: 'dock-btn mobile-only', style: '--gc:#9aa4b2', title: 'Panel de mando y todos los datos', onclick: () => { app.setTab('mando'); app.root.classList.add('show-left'); } }, h('span', { class: 'dock-ic' }, '📋'), h('span', { class: 'd-lbl' }, 'Más')));
}
