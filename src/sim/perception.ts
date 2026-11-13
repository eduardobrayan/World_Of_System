/** Incertidumbre de la información: lo que un país "ve" de otro depende de su inteligencia. */
import type { Id, World } from './types';
import { hashNoise } from './rng';
import { allied } from './vars';
import { clamp } from './util';

/** Precisión (0.3..1) con la que `obs` conoce los datos de `tgt`. */
export function intelAccuracy(world: World, obs: Id, tgt: Id): number {
  if (obs === tgt) return 1;
  const o = world.countries[obs], t = world.countries[tgt];
  if (!o || !t) return 0.5;
  let a = 0.42 + o.intel.level / 260 + (o.intel.networks[tgt] ?? 0) / 180 + t.pol.pressFreedom / 380 - t.intel.counter / 420;
  if (allied(world, obs, tgt)) a += 0.15;
  return clamp(a, 0.3, 1);
}

/** Valor percibido: valor real con ruido determinista que cambia cada trimestre. */
export function perceiveValue(world: World, obs: Id, tgt: Id, key: string, v: number): number {
  const acc = intelAccuracy(world, obs, tgt);
  if (acc >= 0.995) return v;
  const amp = (1 - acc) * 0.4;
  const n = hashNoise(world.seed, Math.floor(world.turn / 3), obs, tgt, key);
  return Math.abs(v) < 1 ? v + n * amp * 2 : v * (1 + n * amp);
}
