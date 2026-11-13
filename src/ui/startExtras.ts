/** Opciones adicionales de la pantalla de inicio (objetivos). */
import type { World } from '../sim/types';

export function objectiveOptions(): [string, string, string][] {
  return [['libre', 'Modo libre (sin objetivo)', 'Juega sin condición de victoria: solo evita las derrotas.']];
}

export function startExtras(_onLoad: (w: World) => void): HTMLElement[] {
  return [];
}
