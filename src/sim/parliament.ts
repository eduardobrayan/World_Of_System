/** Votaciones parlamentarias: los partidos votan según su ideología y su pertenencia al gobierno. */
import type { Country, World } from './types';
import { ideologyOf, regimeOf } from './data';
import { clamp } from './util';

export interface Lean { econ: number; auth: number }

export interface VoteForecast {
  required: boolean;
  prob: number; // probabilidad de aprobación
  yes: number; // escaños esperados a favor
  parties: { name: string; seats: number; gov: boolean; yesProb: number }[];
  text: string;
}

const sig = (x: number) => 1 / (1 + Math.exp(-x));

export function forecastVote(world: World, c: Country, lean: Lean, extraWhip = 0): VoteForecast {
  const reg = regimeOf(c.pol.regime);
  const parties = c.pol.parties.map((p) => {
    const ideo = ideologyOf(p.ideology);
    const agree = ideo.econ * lean.econ * 1.6 + ideo.auth * lean.auth * 1.2 - Math.abs(lean.auth) * 0.2 + (lean.auth > 0.3 && ideo.auth < 0 ? -0.6 : 0);
    let yesProb: number;
    if (p.gov) {
      const discipline = 0.75 + c.pol.approval / 400 + extraWhip * 0.06;
      yesProb = clamp(discipline + agree * 0.15, 0.3, 0.99);
    } else {
      yesProb = clamp(sig(agree * 3 - 1.4 + extraWhip * 0.25), 0.01, 0.9);
    }
    return { name: p.name, seats: p.seats, gov: p.gov, yesProb };
  });
  const total = parties.reduce((a, p) => a + p.seats, 0) || 100;
  const yes = parties.reduce((a, p) => a + p.seats * p.yesProb, 0) / total * 100;
  if (!reg.parliament) {
    return { required: false, prob: 1, yes, parties, text: 'No requiere aprobación parlamentaria en este régimen.' };
  }
  const prob = clamp(sig((yes - 50) / 4) + reg.parliamentBonus / 100, 0.02, 0.99);
  return { required: true, prob, yes, parties, text: `Apoyo esperado: ${yes.toFixed(0)} % de la cámara · probabilidad de aprobación ${(prob * 100).toFixed(0)} %` };
}

export function govSeats(c: Country): number {
  const total = c.pol.parties.reduce((a, p) => a + p.seats, 0) || 100;
  return (c.pol.parties.filter((p) => p.gov).reduce((a, p) => a + p.seats, 0) / total) * 100;
}
