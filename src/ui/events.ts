/** Ventana de eventos: el jugador elige entre varias opciones con consecuencias distintas. */
import { EVENT_BY_ID, resolveEvent } from '../sim/events';
import { describeBundle } from '../sim/actions';
import { evalExpr } from '../sim/expr';
import { resolver } from '../sim/vars';
import { fillTemplate } from '../sim/effects';
import { h, modal, toast } from './dom';
import { effectLines } from './actionui';
import type { App } from './app';
import { flushNewsToasts } from './hooks';
import { dateLabel } from '../sim/util';

const CAT: Record<string, string> = {
  social: 'Sociedad', politica: 'Política', economia: 'Economía', desastre: 'Desastre natural', diplomacia: 'Diplomacia',
  inteligencia: 'Inteligencia', seguridad: 'Seguridad', tecnologia: 'Tecnología', militar: 'Militar', salud: 'Salud',
};

export function openPendingEvent(app: App, uidStr: string) {
  const w = app.world;
  const pe = w.pendingEvents.find((p) => p.uid === uidStr);
  if (!pe) return;
  const def = EVENT_BY_ID[pe.id];
  const c = w.countries[pe.country];
  if (!def || !c) return;
  const target = pe.vars.target ? w.countries[String(pe.vars.target)] : undefined;
  const r = resolver(w, c, target);
  app.modalOpen++;
  app.speed = 0;
  let close = () => undefined as void;
  const text = fillTemplate(def.text, w, c, { source: def.id, target, vars: pe.vars });
  const body = h('div', null,
    h('p', { style: 'font-size:15px' }, text),
    h('div', { class: 'small muted', style: 'margin-bottom:10px' }, `${dateLabel(pe.turn)} · Elige cómo responder:`),
    def.options.map((o, i) => {
      const allowed = !o.requires || !!evalExpr(o.requires, r);
      return h('button', { class: 'option', disabled: !allowed, onclick: () => {
        const t = resolveEvent(w, pe.uid, i);
        toast(`Decisión: ${t}`, 'info');
        close();
        flushNewsToasts(app);
        app.refresh();
        const next = w.pendingEvents.find((p) => p.country === w.player?.country);
        if (next) setTimeout(() => openPendingEvent(app, next.uid), 150);
      } },
      h('div', null, h('b', null, o.text)),
      o.hint ? h('div', { class: 'small ink2' }, o.hint) : null,
      h('div', { class: 'fx' }, effectLines(describeBundle(w, c, o, target))));
    }));
  close = modal({
    title: String(pe.vars.title ?? def.title), kicker: CAT[def.category] ?? def.category, body, closable: false,
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    footer: h('span', { class: 'small muted' }, 'Debes decidir antes de avanzar el turno.'),
  });
}
