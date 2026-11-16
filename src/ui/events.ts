/** Ventana de eventos: el jugador elige entre varias opciones con consecuencias distintas. */
import { EVENT_BY_ID, cabinetChoice, resolveEvent } from '../sim/events';
import { describeBundle } from '../sim/actions';
import { evalExpr } from '../sim/expr';
import { resolver } from '../sim/vars';
import { fillTemplate } from '../sim/effects';
import { h, modal, toast } from './dom';
import { effectLines, effectPills } from './actionui';
import type { App } from './app';
import { flushNewsToasts } from './hooks';
import { dateLabel } from '../sim/util';

const CAT_ICON: Record<string, string> = {
  social: '📢', politica: '🏛️', economia: '💰', desastre: '🌪️', diplomacia: '🤝', inteligencia: '🕵️', seguridad: '🚨', tecnologia: '🔬', militar: '🎖️', salud: '🦠',
};

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
  // Mientras la ventana está abierta el reloj se detiene (app.modalOpen); los asuntos no críticos se pueden cerrar y dejar en la bandeja
  app.modalOpen++;
  const critical = !!def.critical;
  let close = () => undefined as void;
  const text = fillTemplate(def.text, w, c, { source: def.id, target, vars: pe.vars });
  const body = h('div', null,
    h('p', { class: 'ev-text' }, text),
    def.options.map((o, i) => {
      const allowed = !o.requires || !!evalExpr(o.requires, r);
      const lines = describeBundle(w, c, o, target);
      return h('button', { class: 'option ev-opt', disabled: !allowed, onclick: () => {
        if (!w.pendingEvents.some((p) => p.uid === pe.uid)) { close(); app.refresh(); return; }
        const t = resolveEvent(w, pe.uid, i);
        toast(`Decisión: ${t}`, 'info', 4200, '🗳️');
        close();
        flushNewsToasts(app);
        app.refresh();
        const next = w.pendingEvents.find((p) => p.country === w.player?.country && EVENT_BY_ID[p.id]?.critical);
        if (next) setTimeout(() => openPendingEvent(app, next.uid), 150);
      } },
      h('span', { class: 'o-t' }, o.text),
      o.hint ? h('span', { class: 'o-h' }, o.hint) : null,
      effectPills(lines, 3, true));
    }),
    h('details', { class: 'more' }, h('summary', null, 'Ver todos los efectos'),
      def.options.map((o) => h('div', null, h('h4', null, o.text), effectLines(describeBundle(w, c, o, target))))));
  const cabinet = def.options[cabinetChoice(w, pe)]?.text ?? '';
  close = modal({
    title: String(pe.vars.title ?? def.title), kicker: `${critical ? '⚠️ Urgente · ' : ''}${CAT[def.category] ?? def.category} · ${dateLabel(pe.turn)}`,
    icon: CAT_ICON[def.category] ?? '📨', bigIcon: true, hotKicker: critical, body, closable: !critical,
    onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    footer: critical
      ? h('span', { class: 'ev-note' }, '⏸ El tiempo está parado hasta que decidas.')
      : [h('span', { class: 'ev-note' }, `Si no decides en un mes, tu gabinete elegirá «${cabinet}».`),
        h('button', { class: 'btn', onclick: () => close() }, '⏳ Más tarde')],
  });
}
