/**
 * Respuesta visual en el mapa: cada acción y cada suceso importante del mes deja una huella animada
 * (pulso, flecha entre países, explosión, nube de contagio o cifra flotante). Solo presentación.
 */
import type { App } from './app';
import type { ActionDef, Country, World } from '../sim/types';

const GOOD = '#4fd17a', BAD = '#ff6b5e', SPY = '#b4a9ff', INFO = '#8fc3ff', BIO = 'rgba(181,214,96,0.9)';

const HOSTILE = new Set(['sancionar', 'aranceles', 'ultimatum', 'romper_relaciones', 'expulsar_diplomaticos', 'romper_tratado', 'bloqueo_naval', 'maniobras']);
const ICONS: Record<string, string> = {
  acuerdo_comercial: '🤝', alianza: '🛡', ayuda_exterior: '🎁', programa_ayuda: '🎁', sancionar: '🚫', aranceles: '🚧',
  visita_diplomatica: '✈', cumbre: '🤝', declarar_guerra: '⚔', ataque_limitado: '💥', op_espionaje: '🕵', liberar_patogeno: '☣',
};

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 22)}…` : s);

/** Efecto tras ejecutar una acción con éxito. */
export function actionFx(app: App, def: ActionDef, target: Country | undefined, passed: boolean) {
  const me = app.player;
  if (!me) return;
  const map = app.map;
  if (!passed) { map.addFx({ kind: 'float', a: me.id, text: '✗ rechazada', color: BAD }); return; }
  const icon = ICONS[def.id] ?? '✓';
  if (target && target.id !== me.id) {
    if (def.id === 'liberar_patogeno') {
      map.addFx({ kind: 'cloud', a: target.id, color: BIO, dur: 2600 });
      return;
    }
    const war = def.category === 'militar' && !['desplegar', 'retirar_tropas', 'maniobras'].includes(def.id);
    const spy = def.category === 'inteligencia';
    const hostile = war || HOSTILE.has(def.id);
    const color = spy ? SPY : hostile ? BAD : GOOD;
    map.addFx({ kind: 'arrow', a: me.id, b: target.id, color, dashed: spy });
    if (war) map.addFx({ kind: 'boom', a: target.id, color: BAD, delay: 1100 });
    else map.addFx({ kind: 'pulse', a: target.id, color, delay: 1000 });
    map.addFx({ kind: 'float', a: target.id, text: `${icon} ${short(def.name)}`, color, delay: 900 });
    return;
  }
  map.addFx({ kind: 'pulse', a: me.id, color: INFO });
  map.addFx({ kind: 'float', a: me.id, text: `${icon} ${short(def.name)}`, color: GOOD });
}

export interface MonthMark { wars: Set<string>; outbreaks: Set<string>; approval: number; growth: number }

export function markMonth(world: World, me: Country | null): MonthMark {
  return {
    wars: new Set(world.wars.map((w) => w.id)),
    outbreaks: new Set((world.global.outbreaks ?? []).filter((o) => o.detected).map((o) => o.id)),
    approval: me?.pol.approval ?? 0, growth: me?.eco.growth ?? 0,
  };
}

/** Efectos del cambio de mes: guerras nuevas, brotes detectados y cómo cambió tu aprobación. */
export function monthFx(app: App, before: MonthMark) {
  const w = app.world, map = app.map, me = app.player;
  for (const war of w.wars) {
    if (before.wars.has(war.id)) continue;
    for (const d of war.defenders) map.addFx({ kind: 'boom', a: d, color: BAD });
    for (const a of war.attackers.slice(0, 1)) for (const d of war.defenders.slice(0, 2)) map.addFx({ kind: 'arrow', a, b: d, color: BAD });
  }
  for (const o of w.global.outbreaks ?? []) {
    if (!o.detected || before.outbreaks.has(o.id)) continue;
    for (const [id, inf] of Object.entries(o.infected)) if (inf > 0.003) map.addFx({ kind: 'cloud', a: id, color: o.kind === 'humano' ? 'rgba(240,165,124,0.9)' : BIO, dur: 2600 });
  }
  if (me) {
    const d = me.pol.approval - before.approval;
    if (Math.abs(d) >= 0.5) map.addFx({ kind: 'float', a: me.id, text: `${d > 0 ? '▲' : '▼'} aprobación ${d > 0 ? '+' : '−'}${Math.max(1, Math.round(Math.abs(d)))}`, color: d > 0 ? GOOD : BAD });
  }
}
