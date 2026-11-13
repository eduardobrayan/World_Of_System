/**
 * Panel de mando: la vista sencilla por defecto.
 *  - Seis medidores de color (economía, felicidad, estabilidad, seguridad, poder militar, relaciones) con tendencia.
 *  - Consejeros: las tres cosas más urgentes con un botón de acción directa.
 *  - «Avanzado» (plegable): el resumen detallado de siempre.
 */
import type { App } from '../app';
import type { Country, World } from '../../sim/types';
import { h } from '../dom';
import { tip } from '../tooltip';
import { relOp, atWar } from '../../sim/vars';
import { ACTION_BY_ID, previewAction } from '../../sim/actions';
import { openAction } from '../actionui';
import { openPendingEvent } from '../events';
import { renderSummary } from './summary';
import { tweenNumber } from '../live';
import { NEEDS } from '../../sim/needs';

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export interface Gauge { id: string; icon: string; name: string; score: number; detail: string; help: string; tab: string }

/** Medidores 0–100 (100 = muy bien). Reglas sencillas y explicables. */
export function gauges(world: World, c: Country): Gauge[] {
  const e = c.eco;
  const eco = clamp(55 + e.growth * 9 - Math.max(0, e.inflation - 3) * 3 - Math.max(0, e.unemployment - 6) * 2.5 - Math.max(0, e.deficit - 4) * 2);
  const alive = world.order.map((id) => world.countries[id]).filter((x) => x.alive && x.id !== c.id);
  const rank = 1 + alive.filter((x) => x.mil.power > c.mil.power).length;
  const maxP = Math.max(c.mil.power, ...alive.map((x) => x.mil.power)) || 1;
  let rel = 0, wsum = 0;
  for (const x of alive) { const wt = Math.sqrt(x.eco.gdp); rel += relOp(world, x.id, c.id) * wt; wsum += wt; }
  const relAvg = wsum ? rel / wsum : 0;
  return [
    { id: 'economia', icon: '💰', name: 'Economía', score: eco, detail: `${e.growth >= 0 ? '+' : ''}${e.growth.toFixed(1)} % crec.`, help: 'Crecimiento, inflación, paro y déficit juntos.', tab: 'economia' },
    { id: 'felicidad', icon: '😊', name: 'Felicidad', score: clamp(c.soc.satisfaction - c.soc.pressure * 0.5), detail: `aprobación ${Math.round(c.pol.approval)}`, help: 'Satisfacción de la gente, menos la presión por necesidades sin cubrir.', tab: 'sociedad' },
    { id: 'estabilidad', icon: '🏛', name: 'Estabilidad', score: clamp(c.pol.stability), detail: c.pol.stability < 30 ? 'riesgo de golpe' : `protestas ${Math.round(c.soc.protest)}`, help: 'Solidez del Gobierno. Por debajo de 30, peligro.', tab: 'gobierno' },
    { id: 'seguridad', icon: '🚓', name: 'Seguridad', score: clamp(100 - c.police.crime * 1.2), detail: `delito ${Math.round(c.police.crime)}`, help: 'Delincuencia, cárteles y violencia en las calles.', tab: 'seguridad' },
    { id: 'militar', icon: '🎖', name: 'Poder militar', score: clamp(Math.sqrt(c.mil.power / maxP) * 100), detail: `n.º ${rank} del mundo`, help: 'Tu fuerza frente a la mayor potencia.', tab: 'militar' },
    { id: 'relaciones', icon: '🤝', name: 'Relaciones', score: clamp(50 + relAvg * 0.8), detail: atWar(world, c.id) ? 'en guerra' : relAvg >= 0 ? 'te aprecian' : 'te desconfían', help: 'Lo que opina de ti el mundo (pesan más los grandes).', tab: 'diplomacia' },
  ];
}

export function scoreColor(v: number): string {
  return v >= 65 ? '#2fae4e' : v >= 45 ? '#e0a92a' : '#d64545';
}

function gaugeEl(app: App, g: Gauge): HTMLElement {
  const st = (app.ui.gaugeHist ??= {}) as Record<string, Record<number, number>>;
  const hist = (st[g.id] ??= {});
  hist[app.world.turn] = g.score;
  const prev = hist[app.world.turn - 1];
  const d = prev === undefined ? 0 : g.score - prev;
  const col = scoreColor(g.score);
  const num = h('span', { class: 'g-num' }, String(Math.round(g.score)));
  tweenNumber(app, `gauge:${g.id}`, num, g.score, (v) => String(Math.round(v)));
  const el = h('button', { class: 'gauge', style: `--p:${g.score.toFixed(0)};--c:${col}`, 'data-gauge': g.id, onclick: () => app.setTab(g.tab), 'aria-label': `${g.name}: ${Math.round(g.score)} de 100` },
    h('span', { class: 'ring' }, h('span', { class: 'ic' }, g.icon)),
    h('span', { class: 'g-txt' },
      h('span', { class: 'g-name' }, g.name),
      h('span', { class: 'g-val' }, num, Math.abs(d) >= 0.5 ? h('span', { class: `trend ${d > 0 ? 'good' : 'bad'}` }, d > 0 ? '▲' : '▼') : h('span', { class: 'trend flat' }, '▬')),
      h('span', { class: 'g-detail' }, g.detail)));
  tip(el, () => h('div', null, h('div', { class: 't' }, `${g.icon} ${g.name}: ${Math.round(g.score)}/100`), h('div', { class: 'small' }, g.help), h('div', { class: 'small muted' }, 'Clic: ver detalles')));
  return el;
}

interface Advice { sev: number; icon: string; title: string; text: string; actions?: string[]; tab?: string; run?: () => void; label?: string }

/** Las cosas más urgentes ahora mismo, en lenguaje llano, con la acción que las arregla. */
export function adviceFor(app: App, c: Country): Advice[] {
  const w = app.world, e = c.eco;
  const out: Advice[] = [];
  const pend = w.pendingEvents.filter((p) => p.country === c.id);
  if (pend.length) out.push({ sev: 95, icon: '📨', title: `${pend.length} asunto${pend.length > 1 ? 's' : ''} por decidir`, text: 'Si no respondes este mes, decide tu gabinete.', run: () => openPendingEvent(app, pend[0].uid), label: 'Decidir ahora' });
  if (c.pol.stability < 35) out.push({ sev: 90 - c.pol.stability, icon: '🏛', title: 'El Gobierno se tambalea', text: 'Calma a la calle y a los militares.', actions: ['dialogo_social', 'concesiones_militares', 'campana_comunicacion'] });
  if (atWar(w, c.id)) out.push({ sev: 80, icon: '⚔', title: 'Estás en guerra', text: 'Vigila los frentes o negocia la paz.', tab: 'militar', label: 'Ir a Ejército' });
  if (e.inflation > 6) out.push({ sev: 40 + e.inflation * 2, icon: '📈', title: `La inflación sube (${Math.round(e.inflation)} %)`, text: 'Sube tipos o recorta gasto.', actions: ['austeridad', 'control_precios'], tab: 'economia', label: 'Ajustar tipos' });
  if (e.unemployment > 10) out.push({ sev: 30 + e.unemployment * 2, icon: '🔧', title: `Mucho paro (${Math.round(e.unemployment)} %)`, text: 'Crea empleo con un plan de estímulo.', actions: ['estimulo', 'empleo_juvenil'] });
  if (e.growth < 0) out.push({ sev: 55 - e.growth * 5, icon: '📉', title: 'La economía cae', text: 'Un estímulo puede reactivarla.', actions: ['estimulo', 'plan_industrial'] });
  if (e.deficit > 6 || e.riskPremium > 4) out.push({ sev: 45 + e.deficit * 2, icon: '💸', title: 'Gastas más de lo que ingresas', text: 'Ajusta cuentas o persigue el fraude.', actions: ['lucha_fraude', 'austeridad'] });
  if (c.soc.protest > 35) out.push({ sev: 30 + c.soc.protest * 0.6, icon: '📢', title: 'La calle protesta', text: 'Negocia con sindicatos y patronal.', actions: ['dialogo_social', 'campana_comunicacion'] });
  if (c.soc.pressure > 12) {
    const worst = NEEDS.map((n) => ({ n, gap: (c.base[`need_${n.id}`] ?? 0) - (c.soc.needs[n.id] ?? 0) })).sort((a, b) => b.gap - a.gap)[0];
    const fix: Record<string, string[]> = { vivienda: ['ley_vivienda'], sanidad: ['refuerzo_sanitario', 'plan_sanitario'], empleo: ['empleo_juvenil', 'estimulo'], energia: ['subsidio_combustible'], alimentacion: ['control_precios'], seguridad: ['reclutar_policias'], educacion: ['plan_educacion'], pensiones: ['reforma_pensiones'] };
    out.push({ sev: 35 + c.soc.pressure, icon: worst?.n.icon ?? '🏠', title: `Falta ${worst?.n.name.toLowerCase() ?? 'lo básico'}`, text: 'La gente nota que vive peor.', actions: fix[worst?.n.id ?? ''] ?? [], tab: 'sociedad', label: 'Ver necesidades' });
  }
  if (c.pol.approval < 40) out.push({ sev: 60 - c.pol.approval * 0.5, icon: '👎', title: `Aprobación baja (${Math.round(c.pol.approval)})`, text: 'Explica mejor lo que haces.', actions: ['campana_comunicacion'] });
  if (c.pol.corruption > 60) out.push({ sev: c.pol.corruption * 0.6, icon: '💼', title: 'Mucha corrupción', text: 'Frena los sobornos: más recaudación y confianza.', actions: ['ley_anticorrupcion', 'fiscalia_anticorrupcion', 'campana_anticorrupcion'] });
  if (c.narco.cartels > 50) out.push({ sev: c.narco.cartels * 0.6, icon: '💀', title: 'Los cárteles mandan', text: 'Golpéalos o córtales el negocio.', actions: ['ofensiva_antinarco', 'lucha_blanqueo'] });
  else if (c.police.crime > 45) out.push({ sev: c.police.crime * 0.6, icon: '🚓', title: 'Sube la delincuencia', text: 'Más policías en la calle.', actions: ['reclutar_policias', 'policia_comunitaria'] });
  if ((w.global.outbreaks ?? []).some((o) => o.detected && (o.infected[c.id] ?? 0) > 0.003) || (w.global.pandemic?.infected[c.id] ?? 0) > 0.003) out.push({ sev: 70, icon: '🦠', title: 'Brote en tu país', text: 'Refuerza los hospitales ya.', actions: ['refuerzo_sanitario'] });
  if (c.pol.ap >= 12) out.push({ sev: 25, icon: '⚡', title: 'Capital político sin usar', text: 'Aprovéchalo para una reforma.', tab: 'gobierno', label: 'Ver leyes' });
  if (out.length < 3) out.push({ sev: 5, icon: '🌍', title: 'Haz amigos', text: 'Pulsa un país del mapa y propón un acuerdo.', run: () => app.map.fitWorld(), label: 'Ver el mapa' });
  if (out.length < 3) out.push({ sev: 4, icon: '🔬', title: 'Invierte en el futuro', text: 'Elige qué investigar.', tab: 'tecnologia', label: 'Tecnología' });
  if (out.length < 3) out.push({ sev: 3, icon: '🎯', title: 'Revisa tu objetivo', text: 'Mira cuánto te falta.', tab: 'objetivos', label: 'Objetivos' });
  return out.sort((a, b) => b.sev - a.sev);
}

function adviceEl(app: App, c: Country, a: Advice): HTMLElement {
  // Primera acción disponible de la lista (si ninguna lo está, se ofrece ir a la pestaña)
  const def = (a.actions ?? []).map((id) => ACTION_BY_ID[id]).find((d) => d && previewAction(app.world, d, { actor: c }).ok);
  const btn = a.run
    ? h('button', { class: 'btn sm primary', onclick: a.run }, a.label ?? 'Ir')
    : def
      ? h('button', { class: 'btn sm primary', title: def.desc, onclick: () => openAction(app, def, {}) }, `${def.name} ⚡${previewAction(app.world, def, { actor: c }).ap}`)
      : h('button', { class: 'btn sm', onclick: () => app.setTab(a.tab ?? 'gobierno') }, a.label ?? 'Ver');
  const sevCls = a.sev >= 60 ? 'hi' : a.sev >= 35 ? 'mid' : 'lo';
  return h('div', { class: `advice ${sevCls}` }, h('span', { class: 'a-ic' }, a.icon),
    h('div', { class: 'a-body' }, h('b', null, a.title), h('div', { class: 'small ink2' }, a.text), btn));
}

export function renderCommand(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return renderSummary(app);
  const adv = h('details', { class: 'adv', open: app.ui.cmdAdvanced ? '' : undefined },
    h('summary', null, '📋 Avanzado: todos los datos'),
    h('div', null, ...renderSummary(app)));
  adv.addEventListener('toggle', () => {
    const open = (adv as HTMLDetailsElement).open;
    if (!!app.ui.cmdAdvanced === open) return;
    app.ui.cmdAdvanced = open;
    app.refresh(); // la barra superior muestra todas las cifras en modo avanzado
  });
  return [
    h('h2', { class: 'cmd-title' }, '🎛 Panel de mando'),
    h('div', { class: 'cmd-gauges' }, gauges(app.world, c).map((g) => gaugeEl(app, g))),
    h('h3', { class: 'cmd-sub' }, '🧑‍💼 Tus consejeros'),
    h('div', { class: 'advisors' }, adviceFor(app, c).slice(0, 3).map((a) => adviceEl(app, c, a))),
    adv,
  ];
}
