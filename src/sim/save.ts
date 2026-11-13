/** Serialización de partidas (JSON puro). */
import type { World } from './types';

export const SAVE_VERSION = 1;

export function serialize(world: World): string {
  return JSON.stringify(world);
}

export function deserialize(json: string): World {
  const w = JSON.parse(json) as World;
  if (!w || typeof w !== 'object' || !w.countries || !w.order || !Array.isArray(w.rng)) {
    throw new Error('El archivo no es una partida válida.');
  }
  if ((w.version ?? 0) > SAVE_VERSION) throw new Error('La partida procede de una versión más reciente del juego.');
  // Migraciones de campos añadidos en versiones posteriores
  w.chains ??= [];
  w.proposals ??= [];
  w.incidents ??= [];
  w.worldHistory ??= [];
  return w;
}

/** Copia profunda (para previsiones contrafactuales). */
export function cloneWorld(world: World): World {
  return structuredClone(world);
}
