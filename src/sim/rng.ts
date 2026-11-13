/**
 * RNG determinista (sfc32) con estado serializable dentro del mundo.
 * Nunca usar Math.random en la simulación.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: number | string): RngState {
  // Inicialización a partir de un hash de la semilla (cyrb128)
  const str = String(seed);
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const st: RngState = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  const r = new Rng(st);
  for (let i = 0; i < 15; i++) r.next();
  return r.state;
}

export class Rng {
  constructor(public state: RngState) {}

  /** Número uniforme en [0, 1). */
  next(): number {
    let [a, b, c, d] = this.state;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.state[0] = a >>> 0;
    this.state[1] = b >>> 0;
    this.state[2] = c >>> 0;
    this.state[3] = d >>> 0;
    return (t >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normal aproximada (suma de 4 uniformes), media 0, desviación 1. */
  normal(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Elige un índice según pesos no negativos; -1 si todos son 0. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let x = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      x -= Math.max(0, weights[i]);
      if (x < 0) return i;
    }
    return weights.length - 1;
  }
}

/** Ruido determinista sin estado en [-1, 1] a partir de claves (no consume el RNG). */
export function hashNoise(...keys: (string | number)[]): number {
  let h = 2166136261;
  const s = keys.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
