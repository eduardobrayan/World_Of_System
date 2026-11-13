/** Guardado de partidas: ranuras en localStorage (comprimidas con gzip) y exportación/importación en JSON. */
import type { World } from '../sim/types';
import { deserialize, serialize } from '../sim/save';
import { dateLabel } from '../sim/util';

export interface SlotMeta { slot: string; country: string; turn: number; date: string; savedAt: string; objective: string }

const KEY = (slot: string) => `wos:save:${slot}`;
const META = (slot: string) => `wos:meta:${slot}`;
export const SLOTS = ['auto', '1', '2', '3'];

async function gzip(text: string): Promise<string> {
  const cs = new CompressionStream('gzip');
  const buf = await new Response(new Blob([text]).stream().pipeThrough(cs)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
}

export async function saveSlot(slot: string, world: World): Promise<void> {
  const data = await gzip(serialize(world));
  const p = world.player;
  const meta: SlotMeta = {
    slot, country: p ? world.countries[p.country].name : 'Observador', turn: world.turn, date: dateLabel(world.turn),
    savedAt: new Date().toLocaleString('es-ES'), objective: p?.objective ?? 'libre',
  };
  try {
    localStorage.setItem(KEY(slot), data);
    localStorage.setItem(META(slot), JSON.stringify(meta));
  } catch {
    throw new Error('No hay espacio suficiente en el almacenamiento del navegador. Exporta la partida a un archivo JSON.');
  }
}

export async function loadSlot(slot: string): Promise<World> {
  let data: string | null = null;
  try { data = localStorage.getItem(KEY(slot)); } catch { data = null; }
  if (!data) throw new Error('Ranura vacía.');
  return deserialize(await gunzip(data));
}

export function listSlots(): (SlotMeta | null)[] {
  return SLOTS.map((s) => {
    try {
      const m = localStorage.getItem(META(s));
      return m ? (JSON.parse(m) as SlotMeta) : null;
    } catch {
      return null;
    }
  });
}

export function deleteSlot(slot: string) {
  try { localStorage.removeItem(KEY(slot)); localStorage.removeItem(META(slot)); } catch { /* almacenamiento no disponible */ }
}

export function exportJSON(world: World) {
  const blob = new Blob([serialize(world)], { type: 'application/json' });
  const a = document.createElement('a');
  const p = world.player;
  a.href = URL.createObjectURL(blob);
  a.download = `world-of-system_${p ? p.country : 'observador'}_${dateLabel(world.turn).replace(/ /g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function importJSON(): Promise<World> {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return reject(new Error('Sin archivo.'));
      try { resolve(deserialize(await f.text())); } catch (e) { reject(e); }
    };
    inp.click();
  });
}
