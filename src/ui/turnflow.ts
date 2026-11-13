/** Flujo de turno de la interfaz: eventos pendientes, autoguardado y pantalla final. */
import type { App } from './app';
import { openPendingEvent } from './events';
import { showGameOver } from './gameover';

export function beforeTurnExtras(app: App): boolean {
  const pid = app.world.player?.country;
  const pending = app.world.pendingEvents.find((p) => p.country === pid);
  if (pending) {
    openPendingEvent(app, pending.uid);
    return false;
  }
  return true;
}

export function afterTurnExtras(app: App) {
  const pid = app.world.player?.country;
  if (app.world.gameOver) { app.speed = 0; setTimeout(() => showGameOver(app), 200); return; }
  const pending = app.world.pendingEvents.find((p) => p.country === pid);
  if (pending) {
    app.speed = 0;
    setTimeout(() => openPendingEvent(app, pending.uid), 200);
  }
}
