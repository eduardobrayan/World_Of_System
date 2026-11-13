/**
 * Flujo del tiempo en la interfaz (tiempo real sobre una simulación mensual):
 *  - Los asuntos críticos abren su ventana y detienen el reloj hasta que el jugador decide.
 *  - Los demás quedan en la bandeja; si en un mes (~30 días) no hay respuesta, decide el gabinete.
 *  - Autoguardado y pantalla final.
 */
import type { App } from './app';
import { openPendingEvent } from './events';
import { showGameOver } from './gameover';
import { saveSlot } from './storage';
import { toast } from './dom';
import { EVENT_BY_ID, autoResolveExpired } from '../sim/events';

function criticalPending(app: App) {
  const pid = app.world.player?.country;
  return app.world.pendingEvents.find((p) => p.country === pid && EVENT_BY_ID[p.id]?.critical);
}

export function beforeTurnExtras(app: App): boolean {
  const crit = criticalPending(app);
  if (crit) {
    openPendingEvent(app, crit.uid);
    return false;
  }
  for (const r of autoResolveExpired(app.world)) toast(`🗂 Sin respuesta en un mes, tu gabinete decidió «${r.title}»: ${r.option.toLowerCase()}.`, 'info', 6000);
  return true;
}

export function afterTurnExtras(app: App) {
  const pid = app.world.player?.country;
  if (pid && (app.world.turn % 3 === 0 || app.world.gameOver)) {
    saveSlot('auto', app.world).catch((e) => toast(`Autoguardado fallido: ${(e as Error).message}`, 'bad'));
  }
  if (app.world.gameOver) { app.speed = 0; setTimeout(() => showGameOver(app), 200); return; }
  const crit = criticalPending(app);
  if (crit) { setTimeout(() => openPendingEvent(app, crit.uid), 200); return; }
  const fresh = app.world.pendingEvents.filter((p) => p.country === pid && p.turn === app.world.turn);
  for (const pe of fresh) toast(`📨 Nuevo asunto en la bandeja: ${String(pe.vars.title ?? EVENT_BY_ID[pe.id]?.title ?? '')}. Tienes un mes para decidir.`, 'info', 5000);
}
