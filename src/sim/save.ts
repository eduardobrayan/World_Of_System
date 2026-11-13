/** Serialización de partidas (JSON puro). */
import type { World } from './types';
import { initSecurity } from './security';
import { initNeeds } from './needs';

export const SAVE_VERSION = 2;

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
  // v2: seguridad interior, necesidades civiles, armamento propio y armas biológicas
  w.global.outbreaks ??= [];
  for (const id of w.order) {
    const c = w.countries[id];
    c.mil.designs ??= [];
    c.bio ??= { program: 0, lab: 0, defense: 0, designs: [], exposed: -1 };
    if (!c.police || !c.corr || !c.narco) {
      c.police = { size: 300, training: 50, militarization: 30, integrity: 50, crime: 30, effectiveness: 1 };
      initSecurity(w, c);
    }
    if (!c.soc.needs) initNeeds(w, c);
  }
  w.version = SAVE_VERSION;
  return w;
}

/** Copia profunda (para previsiones contrafactuales). */
export function cloneWorld(world: World): World {
  return structuredClone(world);
}
