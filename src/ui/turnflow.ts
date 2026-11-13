/** Flujo de turno de la interfaz: eventos pendientes, autoguardado y pantalla final. */
import type { App } from './app';

export function beforeTurnExtras(app: App): boolean {
  return !!app.world;
}

export function afterTurnExtras(app: App) {
  if (app.world.gameOver) app.speed = 0;
}
