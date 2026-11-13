/** Aplicación de la incertidumbre de información a la interfaz. */
import type { Country, World } from '../sim/types';
import { intelAccuracy, perceiveValue } from '../sim/perception';

export function perceived(ctx: { world: World; player: Country | null }, c: Country, key: string, v: number): number {
  if (!ctx.player || ctx.player.id === c.id) return v;
  return perceiveValue(ctx.world, ctx.player.id, c.id, key, v);
}

export function accuracyOf(world: World, player: Country | null, c: Country): number {
  if (!player) return 1;
  return intelAccuracy(world, player.id, c.id);
}

/** Prefijo "≈" cuando la información no es precisa. */
export function approxMark(world: World, player: Country | null, c: Country): string {
  return accuracyOf(world, player, c) < 0.9 ? '≈ ' : '';
}
