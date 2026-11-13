import type { Country, Id, NewsItem, World } from './types';
import { Rng } from './rng';

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const approach = (x: number, target: number, k: number) => x + (target - x) * k;
export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function turnToDate(turn: number): { year: number; month: number } {
  return { year: 2026 + Math.floor(turn / 12), month: ((turn % 12) + 12) % 12 };
}

export function dateLabel(turn: number): string {
  const { year, month } = turnToDate(turn);
  return `${MONTHS[month][0].toUpperCase()}${MONTHS[month].slice(1)} de ${year}`;
}

/** "2028-11" → turno */
export function ymToTurn(ym: string | null | undefined): number {
  if (!ym) return -1;
  const [y, m] = ym.split('-').map(Number);
  return (y - 2026) * 12 + (m - 1);
}

export function rngOf(world: World): Rng {
  return new Rng(world.rng);
}

export function uid(world: World, prefix: string): string {
  world.uid += 1;
  return `${prefix}${world.uid}`;
}

export function news(world: World, text: string, type: string, countries: Id[], importance = 1) {
  if (world.forecast) return;
  const item: NewsItem = { turn: world.turn, text, type, countries, importance };
  world.news.push(item);
  if (world.news.length > 600) world.news.splice(0, world.news.length - 600);
}

export function timeline(world: World, text: string, kind: string) {
  if (world.forecast) return;
  world.timeline.push({ turn: world.turn, text, kind });
}

export function living(world: World): Country[] {
  return world.order.map((id) => world.countries[id]).filter((c) => c.alive);
}

export function gdppc(c: Country): number {
  return (c.eco.gdp * 1e9) / Math.max(0.01, c.soc.pop * 1e6);
}

export function isPlayer(world: World, id: Id): boolean {
  return world.player?.country === id;
}

export function fmtMoney(bn: number): string {
  const a = Math.abs(bn);
  if (a >= 1000) return `${(bn / 1000).toFixed(a >= 10000 ? 1 : 2)} bill. $`;
  if (a >= 1) return `${bn.toFixed(a >= 100 ? 0 : 1)} mm $`;
  return `${(bn * 1000).toFixed(0)} M$`;
}

export function fmtPct(x: number, d = 1): string {
  return `${x.toFixed(d)} %`;
}

export function sign(x: number, d = 1): string {
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
}

/** Distancia en km entre dos puntos lon/lat. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Marca que han cambiado tratados, sanciones, aranceles, organismos o guerras (invalida cachés). */
export function bumpRev(world: World) {
  world.rev = (world.rev ?? 0) + 1;
}
