/**
 * Director de efectos del mapa: traduce cada acción del jugador y cada novedad del mes (guerras, tratados,
 * sanciones, brotes, elecciones, golpes, desastres, acciones de la IA…) en efectos animados del motor
 * `anim/`. Los del jugador son grandes y con sonido; los del resto del mundo, discretos y limitados en
 * número para no saturar. Solo presentación: no modifica la simulación.
 */
import type { App } from './app';
import { SPEEDS } from './app';
import type { ActionDef, Country, Id, NewsItem, World } from '../sim/types';
import { newsSince } from './live';
import { regionSeed, type Pt } from './geo';
import { capitalPt, coastPt, jitter } from './anim/anchors';
import * as E from './anim/effects';
import type { FxEngine } from './anim/engine';
import { isMuted, onMuteChange, setMuted, sfx } from './sound';
import './fx.css';

const GOOD = '#4fd17a', BAD = '#ff6b5e', SPY = '#b4a9ff', INFO = '#8fc3ff', GOLD = '#ffd36a';

const LABELS: Record<string, string> = {
  acuerdo_comercial: '🤝 Comercio', alianza: '🛡 Alianza', ayuda_exterior: '🎁 Ayuda', programa_ayuda: '🎁 Ayuda', sancionar: '🚫 Sanciones',
  op_espionaje: '🕵 Espionaje', declarar_guerra: '⚔ ¡Guerra!', ataque_limitado: '💥 Ataque', pacto_no_agresion: '🕊 No agresión',
  cooperacion_tecnologica: '🔬 Cooperación', acuerdo_energetico: '⚡ Energía', visita_diplomatica: '✈ Visita', cumbre: '🤝 Cumbre',
  aranceles: '🚧 Aranceles', bloqueo_naval: '⚓ Bloqueo', liberar_patogeno: '☣ Patógeno', op_ciberataque: '💻 Ciberataque',
  maniobras: '🪖 Maniobras', desplegar: '⛺ Despliegue', ultimatum: '⚠ Ultimátum', romper_relaciones: '⛔ Ruptura',
};
const short = (s: string) => {
  const t = s.replace(/^(Proponer|Imponer|Enviar|Lanzar) /, '');
  const u = t.charAt(0).toUpperCase() + t.slice(1);
  return u.length > 22 ? `${u.slice(0, 20)}…` : u;
};

const OBRAS = new Set(['plan_industrial', 'transicion_energetica', 'ley_vivienda', 'plan_sanitario', 'plan_educacion', 'estimulo', 'digitalizacion',
  'administracion_digital', 'disenar_arma', 'producir_unidades', 'nacionalizacion', 'privatizaciones', 'refuerzo_sanitario']);
const POLICE = new Set(['ofensiva_antinarco', 'militarizar_policia', 'reclutar_policias', 'formacion_policial', 'depuracion_policial', 'policia_comunitaria',
  'estado_emergencia', 'ley_seguridad', 'lucha_blanqueo', 'fiscalia_anticorrupcion', 'campana_anticorrupcion']);

interface FxState { last: NewsItem | null }
function st(app: App): FxState {
  return (app.ui.fxState as FxState | undefined) ?? (app.ui.fxState = { last: app.world.news[app.world.news.length - 1] ?? null } as FxState) as FxState;
}

const cap = (w: World, id: Id): Pt => capitalPt(w, id);

/** Gancho de arranque: botón de silencio sobre el mapa y marca inicial de noticias. */
export function initMapFx(app: App) {
  st(app);
  const canvas = app.root.querySelector('main.center canvas');
  const host = canvas?.parentElement;
  if (!host || host.querySelector('.fx-mute')) return;
  const btn = document.createElement('button');
  btn.className = 'fx-mute';
  const paint = (m: boolean) => {
    btn.textContent = m ? '🔇' : '🔊';
    btn.title = m ? 'Activar sonido' : 'Silenciar efectos';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(m));
  };
  paint(isMuted());
  btn.addEventListener('click', () => { setMuted(!isMuted()); if (!isMuted()) sfx('sign', 0.6); });
  const off = onMuteChange(paint);
  const mo = new MutationObserver(() => { if (!btn.isConnected) { off(); mo.disconnect(); } });
  mo.observe(app.root.parentElement ?? document.body, { childList: true });
  host.appendChild(btn);
}

// ======================================================================
// Acciones del jugador
// ======================================================================

/** Efecto tras ejecutar una acción con éxito (o rechazada). */
export function actionFx(app: App, def: ActionDef, target: Country | undefined, passed: boolean) {
  const me = app.player;
  if (!me) return;
  const e = app.map.fx, w = app.world;
  const A = cap(w, me.id);
  const foreign = target && target.id !== me.id ? target : undefined;
  const B = foreign ? cap(w, foreign.id) : A;
  const tag = LABELS[def.id] ?? `✓ ${short(def.name)}`;
  if (!passed) {
    if (foreign) { E.sanction(e, null, B, { color: '#8a8f98', str: 0.5, quiet: true }); E.floatText(e, B, '✗ Rechazada', { color: BAD, delay: 300 }); }
    else E.floatText(e, A, '✗ Rechazada', { color: BAD });
    sfx('alert', 0.5);
    consumeNews(app, true);
    return;
  }
  if (e.reduced) {
    E.pulse(e, B, { color: foreign ? INFO : GOOD });
    E.floatText(e, B, tag, { color: GOOD });
    consumeNews(app, true);
    return;
  }
  // Encuadre: acerca la cámara si la acción se vería demasiado pequeña
  if (foreign) app.map.frame([A, B]);
  else app.map.frame([A], 5);
  if (foreign) foreignAction(app, e, def, me, foreign, A, B, tag);
  else selfAction(app, e, def, me, A, tag);
  consumeNews(app, true);
}

function foreignAction(app: App, e: FxEngine, def: ActionDef, me: Country, t: Country, A: Pt, B: Pt, tag: string) {
  const w = app.world;
  const float = (color: string, delay = 900) => E.floatText(e, B, tag, { color, delay });
  switch (def.id) {
    case 'acuerdo_comercial': {
      E.link(e, A, B, { color: '#7fe0a8', icon: '🤝' });
      E.ship(e, coastPt(w, me, B), coastPt(w, t, A), { kind: 'cargo', delay: 300 });
      E.ship(e, coastPt(w, t, A), coastPt(w, me, B), { kind: 'cargo', delay: 1300, str: 0.8 });
      E.plane(e, A, B, { kind: 'cargo', delay: 700, quiet: true });
      return float(GOOD);
    }
    case 'acuerdo_energetico':
      E.link(e, A, B, { color: '#ffc857', icon: '⚡' });
      E.ship(e, coastPt(w, t, A), coastPt(w, me, B), { kind: 'cargo', delay: 400 });
      return float(GOLD);
    case 'cooperacion_tecnologica':
      E.link(e, A, B, { color: '#6fd3ff', icon: '🔬' });
      E.plane(e, A, B, { kind: 'small', delay: 400, quiet: true });
      return float(INFO);
    case 'alianza':
      E.link(e, A, B, { color: GOLD, icon: '🛡', dur: 4200 });
      E.jets(e, A, B, { n: 3, strike: false, delay: 600, quiet: true, color: '#d8e2ee' });
      E.pulse(e, A, { color: GOLD, delay: 900 }); E.pulse(e, B, { color: GOLD, delay: 900 });
      return float(GOLD);
    case 'pacto_no_agresion': case 'mediacion':
      E.link(e, A, B, { color: '#e8f0ff', icon: '🕊' });
      return float('#e8f0ff');
    case 'visita_diplomatica': case 'cumbre':
      E.plane(e, A, B, { kind: 'small', back: true, tint: '#ffffff' });
      E.pulse(e, B, { color: INFO, delay: 1600 });
      return float(INFO, 1500);
    case 'ayuda_exterior': case 'programa_ayuda':
      E.plane(e, A, B, { kind: 'cargo', drop: true, tint: '#f4fff6' });
      return float(GOOD, 1700);
    case 'levantar_sanciones': case 'retirar_aranceles':
      E.link(e, A, B, { color: GOOD, icon: '🔓' });
      return float(GOOD);
    case 'sancionar':
      E.sanction(e, A, B);
      return float(BAD);
    case 'aranceles':
      E.sanction(e, A, B, { tariff: true, color: '#ff9f43' });
      return float('#ff9f43');
    case 'ultimatum':
      E.link(e, A, B, { color: BAD, icon: '⚠' });
      sfx('alert', 0.8);
      return float(BAD);
    case 'romper_relaciones': case 'expulsar_diplomaticos': case 'romper_tratado':
      E.link(e, A, B, { color: BAD, icon: def.id === 'romper_tratado' ? '💔' : '⛔', dur: 2600 });
      return float(BAD);
    case 'resolucion_onu':
      E.link(e, A, B, { color: '#5aa9ff', icon: '📜' });
      return float(INFO);
    case 'desplegar':
      E.plane(e, A, B, { kind: 'cargo', tint: '#c9d6a3' });
      E.plane(e, A, jitter(B, 2), { kind: 'cargo', delay: 500, tint: '#c9d6a3', quiet: true });
      return float(GOLD, 1600);
    case 'retirar_tropas':
      E.plane(e, B, A, { kind: 'cargo', tint: '#c9d6a3' });
      return float(INFO, 1200);
    case 'maniobras': {
      const mid: Pt = [A[0] + (B[0] - A[0]) * 0.55, A[1] + (B[1] - A[1]) * 0.55];
      E.jets(e, A, mid, { n: 4, strike: false });
      E.ship(e, coastPt(w, me, B), mid, { kind: 'war', delay: 300 });
      return E.floatText(e, mid, tag, { color: '#ffb35c', delay: 900 });
    }
    case 'bloqueo_naval': {
      const from = coastPt(w, me, B), to = coastPt(w, t, A);
      for (let i = 0; i < 3; i++) E.ship(e, from, jitter(to, 2.5), { kind: 'war', delay: i * 450 });
      return float(BAD, 2400);
    }
    case 'declarar_guerra': {
      sfx('alert', 1);
      E.link(e, A, B, { color: BAD, icon: '⚔', dur: 2200, quiet: true });
      for (let i = 0; i < 5; i++) E.missile(e, jitter(A, 1.2), jitter(B, 2.2), { delay: 500 + i * 260, size: 1.2, quiet: i > 1 });
      E.jets(e, A, B, { n: 3, delay: 1400 });
      e.shake(4, 400);
      return float(BAD, 1600);
    }
    case 'ataque_limitado':
      for (let i = 0; i < 3; i++) E.missile(e, jitter(A, 1), jitter(B, 1.8), { delay: i * 320, size: 1.1, quiet: i > 0 });
      E.jets(e, A, B, { n: 2, delay: 900 });
      return float(BAD, 1700);
    case 'comprar_armamento':
      E.ship(e, coastPt(w, t, A), coastPt(w, me, B), { kind: 'cargo' });
      E.plane(e, B, A, { kind: 'cargo', delay: 400, tint: '#c9d6a3', quiet: true });
      return E.floatText(e, A, '🛒 Armamento', { color: GOLD, delay: 1500 });
    case 'cooperacion_antidroga':
      E.link(e, A, B, { color: '#5b8fff', icon: '🚓' });
      E.police(e, B, { delay: 900, str: 0.8 });
      return float(INFO);
    case 'liberar_patogeno':
      E.contagion(e, B, { from: A, color: 'rgba(160,214,80,0.9)' });
      return;
    case 'op_ciberataque':
      E.cyber(e, A, B);
      return float('#5cf2d6', 1000);
    case 'op_desinformacion':
      E.cyber(e, A, B, { color: '#ff7ad9', str: 0.85 });
      return float('#ff7ad9', 1000);
    case 'op_sabotaje':
      E.satellite(e, A, B);
      E.explosion(e, jitter(B, 1), { delay: 2200, size: 0.8 });
      return float(SPY, 1200);
    case 'op_golpe':
      E.satellite(e, A, B);
      E.smoke(e, B, { delay: 2000, icon: '⚔' });
      return float(SPY, 1200);
    case 'op_financiar_oposicion':
      E.satellite(e, A, B, { str: 0.8 });
      E.protest(e, B, { delay: 1800, str: 0.8 });
      return float(SPY, 1200);
    case 'op_financiar_carteles':
      E.ship(e, coastPt(w, me, B), coastPt(w, t, A), { kind: 'boat', color: '#e8dcff' });
      E.satellite(e, null, B, { str: 0.7 });
      return float(SPY, 1200);
    case 'op_bioespionaje':
      E.satellite(e, A, B);
      return E.floatText(e, B, '🧪 Bioespionaje', { color: SPY, delay: 1200 });
    default:
      if (def.category === 'inteligencia') { E.satellite(e, A, B); return float(SPY, 1200); }
      if (def.category === 'militar') { E.missile(e, A, B); return float(BAD, 1500); }
      E.link(e, A, B, { color: INFO });
      return float(INFO);
  }
}

function selfAction(app: App, e: FxEngine, def: ActionDef, me: Country, A: Pt, tag: string) {
  const w = app.world;
  const float = (color: string, delay = 300) => E.floatText(e, A, tag, { color, delay });
  if (def.id === 'uso_nuclear_tactico') {
    // El detonante real llega por las noticias del mismo instante (consumeNews); aquí, la alarma
    sfx('alert', 1);
    E.pulse(e, A, { color: '#ffe14a', r: 70 });
    return E.floatText(e, A, '☢ Uso táctico', { color: '#ffe14a' });
  }
  if (def.id === 'alerta_nuclear' || def.id === 'programa_nuclear') {
    sfx('alert', 0.9);
    E.pulse(e, A, { color: '#ffe14a', r: 60 });
    return E.floatText(e, A, `☢ ${short(def.name)}`, { color: '#ffe14a' });
  }
  if (def.id === 'movilizar') {
    E.jets(e, jitter(A, 3), jitter(A, 6), { n: 3, strike: false });
    E.pulse(e, A, { color: BAD });
    return float('#ffb35c');
  }
  if (def.id === 'reprimir_protestas') {
    E.police(e, A);
    E.smoke(e, jitter(A, 1), { fire: false, delay: 400, str: 0.7, quiet: true, dur: 3200 });
    return float(BAD);
  }
  if (POLICE.has(def.id)) { E.police(e, jitter(A, 0.8)); return float(INFO, 600); }
  if (def.id === 'elecciones_anticipadas' || def.id === 'referendum') { E.confetti(e, A, { icon: '🗳' }); return float(GOLD, 500); }
  if (def.category === 'biologico' || def.id === 'defensa_biologica') {
    E.contagion(e, A, { str: 0.6, color: 'rgba(120,230,170,0.9)', dur: 2600 });
    return E.floatText(e, A, `🧪 ${short(def.name)}`, { color: '#9ee6b8', delay: 400 });
  }
  if (OBRAS.has(def.id) || def.category === 'militar_prod' || def.category === 'militar_arma') {
    E.crane(e, jitter(A, 1.2));
    return float(GOLD, 500);
  }
  void w;
  E.pulse(e, A, { color: INFO });
  return float(GOOD);
}

/** Avanza la marca de noticias; tras una acción del jugador solo reacciona a lo extraordinario (nuclear). */
function consumeNews(app: App, afterAction: boolean) {
  const s = st(app), w = app.world;
  const fresh = newsSince(w.news, s.last);
  s.last = w.news[w.news.length - 1] ?? null;
  if (afterAction) {
    for (const n of fresh) if (n.type === 'nuclear' && /emplea armas nucleares/.test(n.text)) nukeFromNews(app, n, 0);
    return [];
  }
  return fresh;
}

function nukeFromNews(app: App, n: NewsItem, delay: number) {
  const w = app.world, e = app.map.fx;
  const [att, ...enemies] = n.countries;
  if (!att) return;
  app.map.frame([cap(w, att), ...enemies.slice(0, 2).map((id) => cap(w, id))], 4);
  enemies.slice(0, 2).forEach((id, i) => {
    E.missile(e, cap(w, att), cap(w, id), { nuke: true, delay: delay + i * 2600, color: '#fff27a', size: 1.3, lift: 0.5 });
  });
}

// ======================================================================
// Cambio de mes: guerras, noticias del mundo, brotes, sucesos del jugador
// ======================================================================

export interface MonthMark {
  wars: Set<string>; outbreaks: Set<string>; infected: Record<string, Set<string>>;
  pending: Set<string>; approval: number; growth: number;
}

export function markMonth(world: World, me: Country | null): MonthMark {
  const infected: Record<string, Set<string>> = {};
  for (const o of world.global.outbreaks ?? []) infected[o.id] = new Set(Object.keys(o.infected).filter((k) => o.infected[k] > 0.003));
  return {
    wars: new Set(world.wars.map((w) => w.id)),
    outbreaks: new Set((world.global.outbreaks ?? []).filter((o) => o.detected).map((o) => o.id)),
    infected,
    pending: new Set(world.pendingEvents.map((p) => p.uid)),
    approval: me?.pol.approval ?? 0, growth: me?.eco.growth ?? 0,
  };
}

interface Job { pri: number; mine: boolean; run: (delay: number, str: number, quiet: boolean) => void }

export function monthFx(app: App, before: MonthMark) {
  const w = app.world, e = app.map.fx, me = app.player, pid = me?.id;
  const fresh = consumeNews(app, false);
  const monthMs = SPEEDS[app.speed] || SPEEDS[1];
  const span = monthMs * 0.8;
  const reduced = e.reduced;
  const jobs: Job[] = [];
  const mineOf = (ids: Id[]) => !!pid && ids.includes(pid);

  // ---- Guerras nuevas: andanada de misiles y cazas ----
  for (const war of w.wars) {
    if (before.wars.has(war.id)) continue;
    const mine = mineOf([...war.attackers, ...war.defenders]);
    const a = war.leaderA, d = war.leaderD;
    jobs.push({ pri: 10, mine, run: (delay, str, quiet) => {
      if (mine) sfx('alert', 1);
      const A = cap(w, a), D = cap(w, d);
      for (let i = 0; i < (mine ? 5 : 3); i++) E.missile(e, jitter(A, 1), jitter(D, 2), { delay: delay + i * 300, str, quiet: quiet || i > 0, size: 1.1 });
      E.jets(e, A, D, { n: 3, delay: delay + 900, str, quiet });
      E.floatText(e, D, '⚔ ¡Guerra!', { color: BAD, delay: delay + 1500, str });
    } });
  }
  // ---- Frentes activos: bombardeos del mes ----
  if (!reduced) {
    const fronts: { a: Id; d: Id; mine: boolean }[] = [];
    for (const war of w.wars) {
      if (war.ceasefire > 0 || !before.wars.has(war.id)) continue;
      for (const f of war.fronts) fronts.push({ a: f.a, d: f.d, mine: mineOf([f.a, f.d]) });
    }
    fronts.sort((x, y) => Number(y.mine) - Number(x.mine));
    for (const f of fronts.slice(0, e.mobile ? 2 : 4)) {
      jobs.push({ pri: f.mine ? 8 : 3, mine: f.mine, run: (delay, str, quiet) => {
        const A = cap(w, f.a), D = cap(w, f.d);
        const n = f.mine ? 2 : 1;
        for (let i = 0; i < n; i++) E.missile(e, jitter(A, 1.5), jitter(D, 2.5), { delay: delay + i * 700, str, quiet });
        if (Math.random() < 0.5) E.missile(e, jitter(D, 1.5), jitter(A, 2.5), { delay: delay + 1200, str: str * 0.9, quiet: true });
        if (f.mine && Math.random() < 0.5) E.jets(e, A, D, { n: 2, delay: delay + 500, str, quiet });
      } });
    }
  }
  // ---- Noticias del mundo ----
  for (const n of fresh) {
    const job = newsJob(app, n);
    if (job) jobs.push(job);
  }
  // ---- Brotes: nuevos o que saltan a otro país ----
  let spread = 0;
  for (const o of w.global.outbreaks ?? []) {
    const known = o.detected || o.creator === pid;
    if (!known) continue;
    const prev = before.infected[o.id] ?? new Set<string>();
    const isNew = !before.outbreaks.has(o.id) && o.detected;
    const color = o.kind === 'humano' ? 'rgba(240,165,124,0.9)' : 'rgba(160,214,80,0.9)';
    for (const [id, inf] of Object.entries(o.infected)) {
      if (inf <= 0.003 || (prev.has(id) && !isNew) || spread >= 4) continue;
      spread++;
      const from = [...prev].find((x) => x !== id) ?? (o.origin !== id ? o.origin : undefined);
      const mine = id === pid || o.creator === pid;
      jobs.push({ pri: mine ? 7 : 4, mine, run: (delay, str, quiet) => {
        E.contagion(e, cap(w, id), { from: from && !isNew ? cap(w, from) : undefined, color, delay, str, quiet });
      } });
    }
  }
  // ---- Sucesos del jugador (desastres, protestas…) aún pendientes de decisión ----
  for (const p of w.pendingEvents) {
    if (before.pending.has(p.uid) || p.country !== pid) continue;
    const at = cap(w, p.country);
    const run = eventFx(p.id);
    if (run) jobs.push({ pri: 9, mine: true, run: (delay, str, quiet) => run(e, jitter(at, 0.8), delay, str, quiet) });
  }

  // ---- Reparto a lo largo del mes con límite de densidad ----
  const mine = jobs.filter((j) => j.mine).sort((a, b) => b.pri - a.pri).slice(0, 6);
  const maxAi = reduced ? 1 : app.speed >= 3 ? 2 : app.speed === 2 ? 4 : e.mobile ? 4 : 6;
  const ai = e.busy > 120 ? [] : jobs.filter((j) => !j.mine).sort((a, b) => b.pri - a.pri + (Math.random() - 0.5) * 2).slice(0, maxAi);
  mine.forEach((j, i) => j.run(i * Math.min(1400, span / Math.max(1, mine.length)), 1, false));
  ai.forEach((j, i) => j.run(400 + ((i + 0.5) * span) / Math.max(1, ai.length), 0.7, true));

  // ---- Tu aprobación ----
  if (me) {
    const d = me.pol.approval - before.approval;
    if (Math.abs(d) >= 0.5) E.floatText(e, cap(w, me.id), `${d > 0 ? '▲' : '▼'} aprobación ${d > 0 ? '+' : '−'}${Math.max(1, Math.round(Math.abs(d)))}`, { color: d > 0 ? GOOD : BAD, offset: 30, delay: 200 });
  }
}

type Run = (e: FxEngine, at: Pt, delay: number, str: number, quiet: boolean) => void;

/** Efecto para un suceso (por id de evento). */
function eventFx(id: string): Run | null {
  switch (id) {
    case 'terremoto': return (e, at, delay, str, quiet) => E.quake(e, at, { delay, str, quiet });
    case 'huracan': return (e, at, delay, str, quiet) => E.hurricane(e, at, { delay, str, quiet });
    case 'inundaciones': return (e, at, delay, str, quiet) => E.flood(e, at, { delay, str, quiet });
    case 'protestas_masivas': case 'huelga_general': case 'protestas_estudiantiles': case 'crisis_pensiones': case 'crisis_vivienda':
      return (e, at, delay, str, quiet) => E.protest(e, at, { delay, str, quiet });
    case 'atentado': return (e, at, delay, str, quiet) => { E.explosion(e, at, { delay, str, quiet, size: 0.9 }); E.smoke(e, at, { delay: delay + 300, str, quiet: true, dur: 3000 }); };
    case 'masacre_carteles': return (e, at, delay, str, quiet) => { E.smoke(e, at, { delay, str, quiet, icon: '💀' }); };
    case 'captura_capo': case 'alijo_record': case 'motin_policial': return (e, at, delay, str, quiet) => E.police(e, at, { delay, str, quiet });
    case 'ciberataque_sufrido': return (e, at, delay, str, quiet) => E.cyber(e, [at[0] + 6, at[1] + 5], at, { delay, str, quiet });
    case 'rumores_golpe': return (e, at, delay, str, quiet) => E.smoke(e, at, { delay, str, quiet, fire: false, icon: '⚔', dur: 3000 });
    case 'sequia': case 'ola_calor': return (e, at, delay, str) => { E.pulse(e, at, { color: '#ff9f43', delay, str, r: 60 }); E.floatText(e, at, id === 'sequia' ? '🏜 Sequía' : '🔥 Ola de calor', { color: '#ffb35c', delay, str }); };
    case 'apagon': return (e, at, delay, str) => { E.pulse(e, at, { color: '#8a8f98', delay, str }); E.floatText(e, at, '💡 Apagón', { color: '#c3c2b7', delay, str }); };
    case 'yacimiento': case 'inversion_extranjera': return (e, at, delay, str, quiet) => E.crane(e, at, { delay, str, quiet });
    case 'pandemia': return (e, at, delay, str, quiet) => E.contagion(e, at, { delay, str, quiet, color: 'rgba(240,165,124,0.9)' });
    case 'campana_electoral': return (e, at, delay, str, quiet) => E.confetti(e, at, { delay, str, quiet, icon: '🗳' });
    default: return null;
  }
}

const EVENT_TITLES: [RegExp, string][] = [
  [/^Terremoto/, 'terremoto'], [/^Huracán/, 'huracan'], [/^Inundaciones/, 'inundaciones'], [/^(Protestas masivas|Huelga general|Revuelta estudiantil|Jubilados)/, 'protestas_masivas'],
  [/^Atentado/, 'atentado'], [/^Masacre del narco/, 'masacre_carteles'], [/^(Cae un gran capo|Alijo récord|Motín policial)/, 'captura_capo'],
  [/^Ciberataque/, 'ciberataque_sufrido'], [/^Ruido de sables/, 'rumores_golpe'], [/^(Sequía|Ola de calor)/, 'sequia'],
];

/** Convierte una noticia del mes en un efecto (o nada si no tiene representación visual). */
function newsJob(app: App, n: NewsItem): Job | null {
  const w = app.world, e = app.map.fx, pid = w.player?.country;
  const [c0, c1, c2] = n.countries;
  const mine = !!pid && n.countries.includes(pid) && n.countries.length <= 4;
  const valid = (id?: Id) => !!id && !!w.countries[id];
  const T = n.text;
  const job = (pri: number, run: Job['run']): Job => ({ pri: pri + n.importance, mine, run });
  if (n.type === 'nuclear') {
    if (/emplea armas nucleares/.test(T)) return { pri: 20, mine: true, run: (delay) => nukeFromNews(app, n, delay) };
    if (valid(c0)) return job(5, (delay, str) => { E.pulse(e, cap(w, c0), { color: '#ffe14a', delay, str, r: 60 }); E.floatText(e, cap(w, c0), '☢', { color: '#ffe14a', delay, str }); });
    return null;
  }
  if (/^⚔ .* declara la guerra/.test(T)) return null; // ya lo cubre el alta de la guerra
  if (/^💥/.test(T) && valid(c0) && valid(c1)) return job(7, (delay, str, quiet) => {
    for (let i = 0; i < 2; i++) E.missile(e, jitter(cap(w, c0), 1), jitter(cap(w, c1), 1.5), { delay: delay + i * 350, str, quiet: quiet || i > 0 });
  });
  if (/^⚓/.test(T) && valid(c0) && valid(c1)) return job(5, (delay, str, quiet) => {
    const a = w.countries[c0], b = w.countries[c1];
    for (let i = 0; i < 2; i++) E.ship(e, coastPt(w, a, cap(w, c1)), jitter(coastPt(w, b, cap(w, c0)), 2), { kind: 'war', delay: delay + i * 500, str, quiet });
  });
  if (/^🛡 .* entra en la guerra/.test(T) && valid(c0) && valid(c2)) return job(5, (delay, str, quiet) => E.jets(e, cap(w, c0), cap(w, c2), { n: 3, delay, str, quiet }));
  const sign = T.match(/^🤝 .* firman: (.+)\.$/) ?? T.match(/^🤝 .* firman un acuerdo de (cooperación antidroga)/);
  if (sign && valid(c0) && valid(c1)) {
    const kind = sign[1];
    const [icon, color] = /Alianza|Garantía/.test(kind) ? ['🛡', GOLD] : /comercio/.test(kind) ? ['🤝', '#7fe0a8'] : /energético/.test(kind) ? ['⚡', '#ffc857']
      : /agresión|Alto el fuego/.test(kind) ? ['🕊', '#e8f0ff'] : /tecnológica/.test(kind) ? ['🔬', '#6fd3ff'] : /antidroga/.test(kind) ? ['🚓', '#5b8fff'] : ['📜', INFO];
    return job(/Alianza/.test(kind) ? 4 : 2, (delay, str, quiet) => {
      const A = cap(w, c0), B = cap(w, c1);
      E.link(e, A, B, { icon, color, delay, str, quiet });
      if (icon === '🤝' || icon === '⚡') E.ship(e, coastPt(w, w.countries[c0], B), coastPt(w, w.countries[c1], A), { kind: 'cargo', delay: delay + 300, str, quiet });
    });
  }
  if (/^(✈ Visita oficial|🤝 Cumbre)/.test(T) && valid(c0) && valid(c1)) return job(1, (delay, str, quiet) => E.plane(e, cap(w, c0), cap(w, c1), { kind: 'small', back: true, delay, str, quiet, tint: '#ffffff' }));
  if (/^🎁/.test(T) && valid(c0) && valid(c1)) return job(2, (delay, str, quiet) => E.plane(e, cap(w, c0), cap(w, c1), { kind: 'cargo', drop: true, delay, str, quiet }));
  if (/^(📦|↩)/.test(T) && valid(c0) && valid(c1)) return job(1, (delay, str, quiet) => E.sanction(e, cap(w, c0), cap(w, c1), { tariff: true, color: '#ff9f43', delay, str, quiet }));
  if (/^🚫/.test(T) && valid(c0)) {
    const multi = /multilaterales/.test(T);
    return job(3, (delay, str, quiet) => E.sanction(e, multi ? null : cap(w, c0), cap(w, multi ? c0 : c1 ?? c0), { delay, str, quiet }));
  }
  if (/^(⛔|💔)/.test(T) && valid(c0) && valid(c1)) return job(2, (delay, str, quiet) => E.link(e, cap(w, c0), cap(w, c1), { color: BAD, icon: T.startsWith('💔') ? '💔' : '⛔', dur: 2600, delay, str, quiet }));
  if (/^🕵 .* (descubre una operación|expulsa a diplomáticos)/.test(T) && valid(c0) && valid(c1)) {
    // «T descubre una operación de A» → [A, T]; «T expulsa a diplomáticos de A» → [T, A]
    const [spy, victim] = /descubre/.test(T) ? [c0, c1] : [c1, c0];
    return job(1, (delay, str, quiet) => E.satellite(e, cap(w, spy), cap(w, victim), { delay, str: str * 0.8, quiet }));
  }
  if (/^🕊/.test(T)) {
    const ids = n.countries.filter(valid);
    if (ids.length >= 2) return job(4, (delay, str, quiet) => E.link(e, cap(w, ids[ids.length - 2]), cap(w, ids[ids.length - 1]), { color: '#e8f0ff', icon: '🕊', delay, str, quiet }));
  }
  if (/^⛺/.test(T) && valid(c0) && valid(c1)) return job(2, (delay, str, quiet) => E.plane(e, cap(w, c0), cap(w, c1), { kind: 'cargo', tint: '#c9d6a3', delay, str, quiet }));
  if (/^🪖/.test(T) && valid(c0) && valid(c1)) return job(2, (delay, str, quiet) => {
    const A = cap(w, c0), B = cap(w, c1);
    E.jets(e, A, [A[0] + (B[0] - A[0]) * 0.5, A[1] + (B[1] - A[1]) * 0.5], { n: 3, strike: false, delay, str, quiet });
  });
  if (/^🗳 Elecciones|^🗳 .*referéndum/.test(T) && valid(c0)) return job(2, (delay, str, quiet) => E.confetti(e, cap(w, c0), { delay, str, quiet, icon: '🗳' }));
  if (/Golpe de Estado/.test(T) && valid(c0)) return job(6, (delay, str, quiet) => E.smoke(e, cap(w, c0), { delay, str, quiet, icon: /Fracasa/.test(T) ? '🛡' : '⚔' }));
  if (/^✊/.test(T) && valid(c0)) return job(6, (delay, str, quiet) => { E.smoke(e, cap(w, c0), { delay, str, quiet: true, icon: '✊' }); E.protest(e, jitter(cap(w, c0), 1), { delay, str, quiet }); });
  if (/^🏛 Cambio de gobierno/.test(T) && valid(c0)) return job(2, (delay, str) => { E.pulse(e, cap(w, c0), { color: INFO, delay, str }); E.floatText(e, cap(w, c0), '🏛 Nuevo gobierno', { color: INFO, delay, str }); });
  if (/^☣ ¡Fuga en un laboratorio/.test(T) && valid(c0)) return job(8, (delay, str, quiet) => {
    const at = cap(w, c0);
    E.smoke(e, at, { delay, str, quiet: true, fire: false, dur: 2500 });
    E.contagion(e, at, { delay: delay + 400, str, quiet, color: 'rgba(120,230,90,0.95)' });
    E.floatText(e, at, '☣ Fuga de laboratorio', { color: '#b5f07a', delay: delay + 600, str });
  });
  if (/^(💸|🏆)/.test(T) && valid(c0)) return job(3, (delay, str, quiet) => {
    if (T.startsWith('🏆')) E.confetti(e, cap(w, c0), { delay, str, quiet, icon: '🏆' });
    else { E.pulse(e, cap(w, c0), { color: BAD, delay, str }); E.floatText(e, cap(w, c0), '💸 Impago', { color: BAD, delay, str }); }
  });
  if (n.type === 'obra' && valid(c0) && /Iniciada la obra/.test(T)) {
    const c = w.countries[c0];
    const r = c.regions.find((x) => T.includes(` en ${x.name} (`));
    return job(1, (delay, str, quiet) => E.crane(e, r ? regionSeed(r) : cap(w, c0), { delay, str, quiet }));
  }
  if (n.type === 'evento' && valid(c0)) {
    // Para la IA el suceso llega resuelto («Título en País: …»); los del jugador se ven al aparecer el evento
    if (c0 === pid) return null;
    for (const [re, id] of EVENT_TITLES) {
      if (!re.test(T)) continue;
      const run = eventFx(id);
      if (run) return job(id === 'terremoto' || id === 'huracan' ? 3 : 1, (delay, str, quiet) => run(e, cap(w, c0), delay, str, quiet));
    }
  }
  return null;
}
