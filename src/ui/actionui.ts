/** Previsualización y confirmación de acciones: efectos previstos, riesgos y votación. */
import type { ActionDef } from '../sim/types';
import { executeAction, previewAction, type ActionCtx, type EffectLine } from '../sim/actions';
import { DATA } from '../sim/data';
import { h, modal, toast } from './dom';
import type { App } from './app';
import { flushNewsToasts } from './hooks';
import { actionFx } from './fx';

export function effectLines(lines: EffectLine[]): HTMLElement {
  if (!lines.length) return h('div', { class: 'muted small' }, 'Sin efectos directos cuantificables.');
  return h('div', { class: 'effects' }, lines.map((l) => h('div', { class: 'e' },
    h('span', { class: l.hidden ? 'muted' : l.good === undefined ? '' : l.good ? 'good' : 'bad' }, l.hidden ? '❓ Consecuencia incierta' : l.text),
    h('span', { class: 'when' }, l.when))));
}

export function openAction(app: App, def: ActionDef, ctx: Omit<ActionCtx, 'actor'>, after?: () => void) {
  const c = app.player;
  if (!c) return;
  const full: ActionCtx = { actor: c, ...ctx };
  const p = previewAction(app.world, def, full);
  app.modalOpen++;
  let close = () => undefined as void;
  const body = h('div', null,
    h('p', { class: 'ink2' }, def.desc),
    p.extra.map((x) => h('p', { class: 'small' }, x)),
    h('h4', null, 'Requisitos y coste'),
    h('div', { class: 'small' },
      [...p.met.map((m) => h('div', { class: 'good' }, `✓ ${m}`)), ...p.unmet.map((m) => h('div', { class: 'bad' }, `✗ ${m}`))],
      h('div', null, `⚡ Capital político: ${p.ap}${p.money ? ` · 💰 Coste: ${p.money.toFixed(1)} mil millones $` : ''}`)),
    p.vote ? h('div', { class: 'small', style: 'margin-top:6px' }, h('b', null, '🏛 Parlamento: '), p.vote.text,
      h('div', { class: 'muted' }, p.vote.parties.map((x) => `${x.name} ${(x.yesProb * 100).toFixed(0)} %`).join(' · '))) : null,
    h('h4', null, 'Efectos previstos'),
    effectLines(p.lines),
    p.groups.length ? h('div', { class: 'small', style: 'margin-top:6px' }, h('b', null, 'Reacción de los grupos: '),
      p.groups.map((g) => h('span', { class: g.delta > 0 ? 'good' : 'bad', style: 'margin-right:8px' }, `${DATA.groups[g.group]?.icon ?? ''} ${DATA.groups[g.group]?.name ?? g.name} ${g.delta > 0 ? '+' : ''}${g.delta}`))) : null,
    p.risks.length ? h('div', null, h('h4', null, 'Riesgos'), p.risks.map((r) => h('div', { class: 'small warn' }, `⚠ ${r}`))) : null);
  close = modal({
    title: def.name, kicker: def.category, body,
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    footer: [
      h('button', { class: 'btn', onclick: () => close() }, 'Cancelar'),
      h('button', { class: 'btn primary', disabled: !p.ok, onclick: () => {
        const res = executeAction(app.world, def, full);
        toast(res.text, res.ok && res.passed ? 'good' : 'bad');
        close();
        if (res.ok) actionFx(app, def, ctx.target, res.passed);
        flushNewsToasts(app);
        after?.();
        app.refresh();
      } }, `Confirmar (⚡${p.ap})`),
    ],
  });
}
