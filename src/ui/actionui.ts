/**
 * Ventana de confirmación de una acción: icono grande, una frase, 2–4 efectos en pastillas verdes/rojas,
 * el coste y un botón grande «Hacerlo». Requisitos, votación, grupos, riesgos y la lista completa de
 * efectos quedan plegados en «Ver todos los detalles».
 */
import type { ActionDef } from '../sim/types';
import { executeAction, previewAction, type ActionCtx, type EffectLine } from '../sim/actions';
import { DATA } from '../sim/data';
import { h, modal, toast } from './dom';
import type { App } from './app';
import { flushNewsToasts } from './hooks';
import { actionFx } from './fx';

const CAT_ICON: Record<string, string> = {
  ley: '📜', economia: '💰', social: '😊', gobierno: '🏛️', politica: '🏛️', gobierno_ministro: '👔', diplomacia: '🤝', organismo: '🌐',
  militar: '🎖️', militar_prod: '🏭', militar_doc: '📘', inteligencia: '🕵️', inteligencia_propia: '🛡️', seguridad: '🚓', biologico: '☣️', militar_arma: '🛠️',
};
const CAT_NAME: Record<string, string> = {
  ley: 'Ley', economia: 'Economía', social: 'Bienestar', gobierno: 'Gobierno', politica: 'Política', gobierno_ministro: 'Gobierno', diplomacia: 'Diplomacia',
  organismo: 'Organismos', militar: 'Ejército', militar_prod: 'Ejército', militar_doc: 'Ejército', inteligencia: 'Espionaje', inteligencia_propia: 'Espionaje',
  seguridad: 'Seguridad', biologico: 'Biológico', militar_arma: 'Armamento',
};
const ACTION_ICON: Record<string, string> = {
  reforma_laboral: '🔧', reforma_pensiones: '👵', ley_anticorrupcion: '⚖️', renta_basica: '💶', reforma_fiscal_progresiva: '🧾', rebaja_fiscal: '✂️',
  ley_vivienda: '🏠', plan_sanitario: '🏥', plan_educacion: '🎓', transicion_energetica: '🌱', ley_seguridad: '🚨', ley_igualdad: '⚧️', digitalizacion: '💻',
  plan_industrial: '🏭', privatizaciones: '🏷️', nacionalizacion: '🏗️', austeridad: '📉', estimulo: '🚀', control_precios: '🛒', subsidio_combustible: '⛽',
  lucha_fraude: '🔍', empleo_juvenil: '🧑‍🎓', refuerzo_sanitario: '🚑', integracion_inmigrantes: '🤲', dialogo_social: '🗣️', campana_comunicacion: '📣',
  estado_emergencia: '🚨', reprimir_protestas: '🛡️', campana_anticorrupcion: '🧹', purga_militar: '🎖️', concesiones_militares: '🎖️', amnistia: '🕊️',
  elecciones_anticipadas: '🗳️', referendum: '🗳️', manipular_elecciones: '🎭', reforma_constitucional: '📜', apertura_democratica: '🗽',
  visita_diplomatica: '✈️', cumbre: '🤝', acuerdo_comercial: '🤝', alianza: '🛡️', pacto_no_agresion: '🕊️', cooperacion_tecnologica: '🔬', acuerdo_energetico: '⚡',
  ayuda_exterior: '🎁', programa_ayuda: '🎁', sancionar: '🚫', levantar_sanciones: '✅', aranceles: '🧱', retirar_aranceles: '🔓', ultimatum: '⏰', mediacion: '🕊️',
  romper_relaciones: '💔', expulsar_diplomaticos: '🚪', romper_tratado: '📄', resolucion_onu: '🇺🇳', movilizar: '🪖', desmovilizar: '🏠', desplegar: '🚚',
  retirar_tropas: '↩️', maniobras: '🎯', bloqueo_naval: '⚓', declarar_guerra: '⚔️', ataque_limitado: '💥', alerta_nuclear: '☢️', uso_nuclear_tactico: '☢️',
  bajar_alerta: '🕊️', programa_nuclear: '☢️', op_espionaje: '🕵️', op_financiar_oposicion: '💰', op_sabotaje: '💣', op_robo_tecnologia: '💾',
  op_desinformacion: '📺', op_ciberataque: '💻', op_golpe: '🎭', contraespionaje: '🛡️', servicios_inteligencia: '🕵️', reclutar_policias: '👮',
  formacion_policial: '📚', depuracion_policial: '🧹', policia_comunitaria: '🏘️', militarizar_policia: '🪖', ofensiva_antinarco: '🚁', sustitucion_cultivos: '🌽',
  lucha_blanqueo: '🏦', legalizar_cannabis: '🌿', tratamiento_adicciones: '💊', negociar_carteles: '🤫', cooperacion_antidroga: '🤝', fiscalia_anticorrupcion: '⚖️',
  reforma_judicial: '⚖️', administracion_digital: '💻', autoridad_electoral: '🗳️', clientelismo: '🤝', defensa_biologica: '🧪', op_financiar_carteles: '💀', op_bioespionaje: '🧫',
};

export function actionIcon(def: ActionDef): string {
  return ACTION_ICON[def.id] ?? CAT_ICON[def.category] ?? '⚡';
}

/** Texto corto de una línea de efecto («▲ Crecimiento +0.9») y su color. */
export function effectPill(l: EffectLine, sm = false): HTMLElement {
  const [rawName, ...rest] = l.text.replace(/^desde el mes \d+, /, '').split(':');
  let val = rest.join(':').trim();
  const down = /^[-−]|^×0\./.test(val);
  const name = rawName.replace(/\s*\([^)]*\)/g, '').trim();
  const short = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  val = val.replace(/(\.\d)0\b/, '$1').replace(/\.0\b/, '');
  const showVal = !sm && val.length <= 6 && !val.startsWith('×');
  const cls = l.good === undefined ? 'neutral' : l.good ? 'good' : 'bad';
  return h('span', { class: `fxp ${cls} ${sm ? 'sm' : ''}`, title: `${l.text}${l.when ? ` (${l.when})` : ''}` }, `${down ? '▼' : '▲'} ${short}${showVal ? ` ${val}` : ''}`);
}

/** Lista completa de efectos (modo detallado). */
export function effectLines(lines: EffectLine[]): HTMLElement {
  if (!lines.length) return h('div', { class: 'muted small' }, 'Sin efectos directos cuantificables.');
  return h('div', { class: 'effects' }, lines.map((l) => h('div', { class: 'e' },
    h('span', { class: l.hidden ? 'muted' : l.good === undefined ? '' : l.good ? 'good' : 'bad' }, l.hidden ? '❓ Consecuencia incierta' : l.text),
    h('span', { class: 'when' }, l.when))));
}

/** Las 2–4 consecuencias más claras, como pastillas de color. */
export function effectPills(lines: EffectLine[], max = 4, sm = false): HTMLElement | null {
  const vis = lines.filter((l) => !l.hidden && l.good !== undefined);
  // Primero lo bueno y lo malo alternados, para que se vea el equilibrio
  const good = vis.filter((l) => l.good), bad = vis.filter((l) => !l.good);
  const pick: EffectLine[] = [];
  while (pick.length < max && (good.length || bad.length)) {
    if (good.length) pick.push(good.shift()!);
    if (pick.length < max && bad.length) pick.push(bad.shift()!);
  }
  const hidden = lines.some((l) => l.hidden);
  if (!pick.length && !hidden) return null;
  return h('div', { class: 'pills' }, pick.map((l) => effectPill(l, sm)), hidden ? h('span', { class: `fxp neutral ${sm ? 'sm' : ''}` }, '❓ algo incierto') : null);
}

export function openAction(app: App, def: ActionDef, ctx: Omit<ActionCtx, 'actor'>, after?: () => void) {
  const c = app.player;
  if (!c) return;
  const full: ActionCtx = { actor: c, ...ctx };
  const p = previewAction(app.world, def, full);
  app.modalOpen++;
  let close = () => undefined as void;
  const sentence = (() => { const i = def.desc.search(/[.;:](\s|$)/); return i > 20 ? def.desc.slice(0, i + 1) : def.desc; })();
  const vote = p.vote?.required ? p.vote : null;
  const voteCls = vote ? (vote.prob >= 0.6 ? 'good' : vote.prob >= 0.35 ? 'warn' : 'bad') : '';
  const pills = effectPills(p.lines);
  const details = h('details', { class: 'more' }, h('summary', null, 'Ver todos los detalles'),
    def.desc !== sentence ? h('p', { class: 'ink2 small' }, def.desc) : null,
    p.extra.map((x) => h('p', { class: 'small' }, x)),
    h('h4', null, 'Todos los efectos'),
    effectLines(p.lines),
    p.met.length || p.unmet.length ? h('div', null, h('h4', null, 'Requisitos'), h('div', { class: 'small' },
      [...p.met.map((m) => h('div', { class: 'good' }, `✓ ${m}`)), ...p.unmet.map((m) => h('div', { class: 'bad' }, `✗ ${m}`))])) : null,
    p.vote ? h('div', null, h('h4', null, 'Parlamento'), h('div', { class: 'small' }, p.vote.text),
      h('div', { class: 'small muted' }, p.vote.parties.map((x) => `${x.name} ${(x.yesProb * 100).toFixed(0)} %`).join(' · '))) : null,
    p.groups.length ? h('div', null, h('h4', null, 'Cómo reacciona la gente'), h('div', { class: 'pills' },
      p.groups.map((g) => h('span', { class: `fxp sm ${g.delta > 0 ? 'good' : 'bad'}` }, `${DATA.groups[g.group]?.icon ?? ''} ${DATA.groups[g.group]?.name ?? g.name} ${g.delta > 0 ? '+' : ''}${g.delta}`)))) : null,
    p.risks.length ? h('div', null, h('h4', null, 'Riesgos'), p.risks.map((r) => h('div', { class: 'small warn' }, `⚠️ ${r}`))) : null);
  const body = h('div', null,
    h('p', { class: 'act-desc' }, sentence),
    pills ?? h('div', { class: 'small muted' }, 'Sin efectos directos medibles.'),
    h('div', { class: 'act-cost' },
      h('span', { class: 'cost-chip ap', title: 'Capital político' }, `⚡ ${p.ap} de capital`),
      p.money > 0.05 ? h('span', { class: 'cost-chip', title: 'Coste' }, `💰 ${p.money.toFixed(1)} mil millones $`) : null,
      vote ? h('span', { class: `cost-chip vote ${voteCls}`, title: vote.text }, `🏛️ ${Math.round(vote.prob * 100)} % de que el parlamento lo apruebe`) : null,
      p.risks.length ? h('span', { class: 'cost-chip', style: 'color:#ffe2a8' }, `⚠️ ${p.risks.length} riesgo${p.risks.length > 1 ? 's' : ''}`) : null),
    !p.ok ? h('div', { class: 'blocked' }, '🔒', p.unmet[0] ?? 'Ahora no es posible.') : null,
    details);
  const target = ctx.target ? ` · ${ctx.target.name}` : '';
  close = modal({
    title: def.name, kicker: `${CAT_NAME[def.category] ?? def.category}${target}`, icon: actionIcon(def), bigIcon: true, body,
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    footer: [
      h('button', { class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { class: 'btn primary big go', disabled: !p.ok, onclick: () => {
        const res = executeAction(app.world, def, full);
        // Una propuesta enviada pero rechazada por el otro país también cuenta como «no»
        const yes = res.ok && res.passed && !/\brechaza/i.test(res.text);
        toast(res.text, yes ? 'good' : 'bad');
        close();
        if (res.ok) actionFx(app, def, ctx.target, yes);
        flushNewsToasts(app);
        after?.();
        app.refresh();
      } }, p.ok ? `✔ Hacerlo · ⚡${p.ap}` : '🔒 No disponible'),
    ],
  });
}
