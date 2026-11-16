/**
 * Sonidos breves sintetizados con WebAudio (sin archivos). Volumen bajo por defecto, silencio persistente
 * en localStorage y nunca suenan antes de la primera interacción del usuario.
 */
export type Sfx = 'missile' | 'boom' | 'bigboom' | 'nuke' | 'jet' | 'whoosh' | 'sign' | 'lock' | 'scan' | 'cyber' | 'bio'
  | 'crowd' | 'siren' | 'build' | 'cheer' | 'alert' | 'quake' | 'wind' | 'water';

const KEY = 'wos:sonido';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
let noiseBuf: AudioBuffer | null = null;
const lastPlay: Record<string, number> = {};
const listeners = new Set<(m: boolean) => void>();

function unlock() {
  unlocked = true;
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function isMuted() { return muted; }
export function onMuteChange(f: (m: boolean) => void) { listeners.add(f); return () => listeners.delete(f); }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* sin almacenamiento */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.22, ctx.currentTime, 0.05);
  for (const f of listeners) f(m);
}

function audio(): AudioContext | null {
  if (!unlocked || muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = 0.22;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function env(c: AudioContext, g: GainNode, t: number, a: number, peak: number, dec: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, a = 0.01) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(c, g, t, a, vol, dur);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + a + dur + 0.05);
}

function hiss(c: AudioContext, t: number, dur: number, vol: number, f0: number, f1: number, q = 0.8, type: BiquadFilterType = 'lowpass', a = 0.01) {
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain(); env(c, g, t, a, vol, dur);
  s.connect(f); f.connect(g); g.connect(master!);
  s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

/** Reproduce un efecto (con límite de frecuencia por tipo para no saturar). */
export function sfx(kind: Sfx, vol = 1) {
  const c = audio();
  if (!c || vol <= 0.05) return;
  const now = performance.now();
  if (now - (lastPlay[kind] ?? 0) < (kind === 'boom' ? 120 : 220)) return;
  lastPlay[kind] = now;
  const t = c.currentTime + 0.01, v = Math.min(1, vol);
  switch (kind) {
    case 'missile': hiss(c, t, 0.9, 0.35 * v, 600, 2600, 1.2, 'bandpass', 0.15); break;
    case 'boom': hiss(c, t, 0.7, 0.9 * v, 900, 60); tone(c, 'sine', 120, 40, t, 0.5, 0.6 * v); break;
    case 'bigboom': hiss(c, t, 1.4, 1 * v, 700, 40); tone(c, 'sine', 90, 30, t, 1.1, 0.8 * v); break;
    case 'nuke': hiss(c, t, 3.2, 1, 1200, 30, 0.7, 'lowpass', 0.02); tone(c, 'sine', 70, 22, t, 2.8, 1); tone(c, 'triangle', 50, 25, t + 0.2, 2.4, 0.5); break;
    case 'jet': hiss(c, t, 1.6, 0.35 * v, 300, 1800, 0.9, 'bandpass', 0.5); break;
    case 'whoosh': hiss(c, t, 0.8, 0.2 * v, 400, 1400, 1, 'bandpass', 0.25); break;
    case 'sign': tone(c, 'sine', 660, 660, t, 0.25, 0.25 * v); tone(c, 'sine', 990, 990, t + 0.12, 0.4, 0.22 * v); break;
    case 'lock': tone(c, 'square', 220, 110, t, 0.12, 0.18 * v); hiss(c, t, 0.12, 0.4 * v, 3000, 800, 2, 'bandpass'); break;
    case 'scan': tone(c, 'sine', 1200, 1800, t, 0.35, 0.12 * v); tone(c, 'sine', 1800, 1200, t + 0.4, 0.35, 0.1 * v); break;
    case 'cyber': for (let i = 0; i < 5; i++) tone(c, 'square', 400 + Math.random() * 1400, 200 + Math.random() * 800, t + i * 0.07, 0.06, 0.1 * v); break;
    case 'bio': hiss(c, t, 1.2, 0.2 * v, 300, 900, 4, 'bandpass', 0.3); break;
    case 'crowd': hiss(c, t, 1.2, 0.25 * v, 500, 700, 1.5, 'bandpass', 0.3); break;
    case 'siren': tone(c, 'triangle', 700, 950, t, 0.3, 0.12 * v); tone(c, 'triangle', 950, 700, t + 0.32, 0.3, 0.12 * v); break;
    case 'build': for (let i = 0; i < 3; i++) tone(c, 'square', 330, 300, t + i * 0.16, 0.05, 0.1 * v); break;
    case 'cheer': tone(c, 'sine', 523, 523, t, 0.15, 0.18 * v); tone(c, 'sine', 659, 659, t + 0.1, 0.15, 0.18 * v); tone(c, 'sine', 784, 784, t + 0.2, 0.3, 0.2 * v); break;
    case 'alert': tone(c, 'sawtooth', 440, 440, t, 0.18, 0.12 * v); tone(c, 'sawtooth', 330, 330, t + 0.22, 0.25, 0.12 * v); break;
    case 'quake': hiss(c, t, 1.6, 0.8 * v, 160, 50, 1, 'lowpass', 0.2); break;
    case 'wind': hiss(c, t, 2.2, 0.35 * v, 500, 1500, 3, 'bandpass', 0.6); break;
    case 'water': hiss(c, t, 1.4, 0.3 * v, 1200, 400, 1.5, 'bandpass', 0.3); break;
  }
}
