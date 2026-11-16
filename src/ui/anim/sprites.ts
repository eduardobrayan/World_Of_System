/**
 * Sprites vectoriales (Path2D) para los efectos del mapa. Cada sprite mira hacia +x y mide ~1 unidad
 * de largo; se dibujan con translate/rotate/scale. Sin imágenes externas.
 */

function path(d: string): Path2D { return new Path2D(d); }

export const SPR = {
  missile: path('M0.55 0 L0.3 -0.07 L-0.35 -0.07 L-0.5 -0.2 L-0.5 0.2 L-0.35 0.07 L0.3 0.07 Z'),
  jet: path('M0.55 0 L0.25 -0.07 L0.05 -0.07 L-0.2 -0.48 L-0.32 -0.48 L-0.2 -0.07 L-0.38 -0.07 L-0.5 -0.22 L-0.56 -0.22 L-0.5 0 L-0.56 0.22 L-0.5 0.22 L-0.38 0.07 L-0.2 0.07 L-0.32 0.48 L-0.2 0.48 L0.05 0.07 L0.25 0.07 Z'),
  cargo: path('M0.5 0 Q0.5 -0.08 0.38 -0.09 L0.12 -0.09 L-0.02 -0.55 L-0.14 -0.55 L-0.1 -0.09 L-0.36 -0.08 L-0.46 -0.26 L-0.52 -0.26 L-0.48 0 L-0.52 0.26 L-0.46 0.26 L-0.36 0.08 L-0.1 0.09 L-0.14 0.55 L-0.02 0.55 L0.12 0.09 L0.38 0.09 Q0.5 0.08 0.5 0 Z'),
  smallPlane: path('M0.5 0 L0.3 -0.06 L0.1 -0.06 L0.05 -0.5 L-0.05 -0.5 L-0.05 -0.06 L-0.38 -0.05 L-0.45 -0.2 L-0.5 -0.2 L-0.48 0 L-0.5 0.2 L-0.45 0.2 L-0.38 0.05 L-0.05 0.06 L-0.05 0.5 L0.05 0.5 L0.1 0.06 L0.3 0.06 Z'),
  hull: path('M0.55 0 Q0.35 -0.17 0.1 -0.17 L-0.45 -0.15 L-0.5 0 L-0.45 0.15 L0.1 0.17 Q0.35 0.17 0.55 0 Z'),
  boat: path('M0.5 0 Q0.25 -0.2 -0.1 -0.2 L-0.5 -0.17 L-0.5 0.17 L-0.1 0.2 Q0.25 0.2 0.5 0 Z'),
  tankHull: path('M-0.5 -0.3 L0.42 -0.3 L0.5 -0.22 L0.5 0.22 L0.42 0.3 L-0.5 0.3 Z'),
  tankTurret: path('M-0.22 -0.17 L0.12 -0.17 L0.2 -0.08 L0.2 0.08 L0.12 0.17 L-0.22 0.17 Z M0.15 -0.035 L0.72 -0.035 L0.72 0.035 L0.15 0.035 Z'),
  satBody: path('M-0.14 -0.14 L0.14 -0.14 L0.14 0.14 L-0.14 0.14 Z'),
  satPanels: path('M-0.6 -0.09 L-0.2 -0.09 L-0.2 0.09 L-0.6 0.09 Z M0.2 -0.09 L0.6 -0.09 L0.6 0.09 L0.2 0.09 Z'),
  lockBody: path('M-0.32 -0.05 L0.32 -0.05 Q0.38 -0.05 0.38 0.01 L0.38 0.42 Q0.38 0.48 0.32 0.48 L-0.32 0.48 Q-0.38 0.48 -0.38 0.42 L-0.38 0.01 Q-0.38 -0.05 -0.32 -0.05 Z'),
  lockShackle: path('M-0.22 -0.05 L-0.22 -0.25 A0.22 0.22 0 0 1 0.22 -0.25 L0.22 -0.05'),
  canopy: path('M-0.5 0 A0.5 0.42 0 0 1 0.5 0 Q0.375 -0.08 0.25 0 Q0.125 -0.08 0 0 Q-0.125 -0.08 -0.25 0 Q-0.375 -0.08 -0.5 0 Z'),
  crate: path('M-0.16 0.42 L0.16 0.42 L0.16 0.7 L-0.16 0.7 Z'),
  banner: path('M-0.03 -0.5 L0.03 -0.5 L0.03 0.5 L-0.03 0.5 Z'),
  flag: path('M0.03 -0.5 L0.62 -0.46 L0.6 -0.12 L0.03 -0.15 Z'),
  container: path('M-0.3 -0.11 L0 -0.11 L0 0.11 L-0.3 0.11 Z'),
};

export function drawSprite(g: CanvasRenderingContext2D, p: Path2D, x: number, y: number, ang: number, size: number, fill: string, stroke?: string, lw = 0.06) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(size, size);
  g.fillStyle = fill;
  g.fill(p);
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.stroke(p); }
  g.restore();
}

/** Tanque visto desde arriba (casco + torreta), con el cañón hacia +x. */
export function drawTank(g: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, body: string, dark: string) {
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(size, size);
  g.fillStyle = dark; g.fillRect(-0.55, -0.38, 1.1, 0.14); g.fillRect(-0.55, 0.24, 1.1, 0.14); // orugas
  g.fillStyle = body; g.fill(SPR.tankHull);
  g.lineWidth = 0.07; g.strokeStyle = dark; g.stroke(SPR.tankHull);
  g.fillStyle = dark; g.fill(SPR.tankTurret);
  g.restore();
}

/** Barco: carguero con contenedores de colores o buque de guerra gris. */
export function drawShip(g: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number, kind: 'cargo' | 'war' | 'boat', tint = '#e9e4d8') {
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(size, size);
  if (kind === 'boat') {
    g.fillStyle = tint; g.fill(SPR.boat);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-0.32, -0.09, 0.3, 0.18);
  } else if (kind === 'war') {
    g.fillStyle = '#7f8b98'; g.fill(SPR.hull);
    g.lineWidth = 0.05; g.strokeStyle = '#2b333c'; g.stroke(SPR.hull);
    g.fillStyle = '#4a5562'; g.fillRect(-0.2, -0.08, 0.3, 0.16);
    g.beginPath(); g.arc(0.28, 0, 0.07, 0, Math.PI * 2); g.fill();
    g.fillRect(0.28, -0.02, 0.18, 0.04);
  } else {
    g.fillStyle = '#d9d2c3'; g.fill(SPR.hull);
    g.lineWidth = 0.05; g.strokeStyle = '#3a3a36'; g.stroke(SPR.hull);
    const cols = ['#d6604d', '#4f8fd6', '#e5b544', '#58b07a'];
    for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(-0.36 + i * 0.17, -0.1, 0.15, 0.2); }
    g.fillStyle = '#f4f1ea'; g.fillRect(-0.48, -0.08, 0.1, 0.16);
  }
  g.restore();
}

export function drawSatellite(g: CanvasRenderingContext2D, x: number, y: number, ang: number, size: number) {
  g.save();
  g.translate(x, y); g.rotate(ang); g.scale(size, size);
  g.fillStyle = '#4a7fd0'; g.fill(SPR.satPanels);
  g.lineWidth = 0.04; g.strokeStyle = '#a9c8ff'; g.stroke(SPR.satPanels);
  g.strokeStyle = '#cfd8e6'; g.beginPath(); g.moveTo(-0.2, 0); g.lineTo(0.2, 0); g.stroke();
  g.fillStyle = '#e6e2d6'; g.fill(SPR.satBody);
  g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(0, 0.2, 0.06, 0, Math.PI * 2); g.fill();
  g.restore();
}

export function drawLock(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  g.save();
  g.translate(x, y); g.scale(size, size);
  g.lineWidth = 0.12; g.strokeStyle = color; g.lineCap = 'round'; g.stroke(SPR.lockShackle);
  g.fillStyle = color; g.fill(SPR.lockBody);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(0, 0.16, 0.07, 0, Math.PI * 2); g.fill(); g.fillRect(-0.03, 0.18, 0.06, 0.16);
  g.restore();
}

export function drawParachute(g: CanvasRenderingContext2D, x: number, y: number, size: number, sway: number) {
  g.save();
  g.translate(x, y); g.rotate(sway); g.scale(size, size);
  g.strokeStyle = 'rgba(240,239,236,0.8)'; g.lineWidth = 0.03;
  g.beginPath(); g.moveTo(-0.48, 0); g.lineTo(-0.1, 0.42); g.moveTo(0.48, 0); g.lineTo(0.1, 0.42); g.moveTo(0, 0); g.lineTo(0, 0.42); g.stroke();
  g.fillStyle = '#f2f0ea'; g.fill(SPR.canopy);
  g.fillStyle = '#e06a4f'; g.save(); g.clip(SPR.canopy); g.fillRect(-0.17, -0.5, 0.34, 0.5); g.restore();
  g.fillStyle = '#b98a4e'; g.fill(SPR.crate);
  g.strokeStyle = '#6b4c27'; g.lineWidth = 0.04; g.stroke(SPR.crate);
  g.restore();
}

/** Grúa de obra vista de lado; `swing` gira la pluma. */
export function drawCrane(g: CanvasRenderingContext2D, x: number, y: number, size: number, swing: number) {
  g.save();
  g.translate(x, y); g.scale(size, size);
  g.strokeStyle = '#ffc94a'; g.lineWidth = 0.06; g.lineJoin = 'round';
  // Torre en celosía
  g.beginPath();
  g.moveTo(-0.08, 0.5); g.lineTo(-0.08, -0.4); g.moveTo(0.08, 0.5); g.lineTo(0.08, -0.4);
  for (let i = 0; i < 6; i++) { const y0 = 0.5 - i * 0.15; g.moveTo(-0.08, y0); g.lineTo(0.08, y0 - 0.15); }
  g.stroke();
  // Pluma
  const L = 0.62 * Math.cos(swing), back = 0.22 * Math.cos(swing);
  g.beginPath(); g.moveTo(-back, -0.4); g.lineTo(L, -0.4); g.stroke();
  g.fillStyle = '#c9cdd3'; g.fillRect(-back - 0.08, -0.42, 0.12, 0.1);
  // Cable y gancho
  g.strokeStyle = 'rgba(230,230,230,0.8)'; g.lineWidth = 0.025;
  const hx = L * 0.8, hy = -0.4 + 0.35 + Math.sin(swing * 3) * 0.04;
  g.beginPath(); g.moveTo(hx, -0.4); g.lineTo(hx, hy); g.stroke();
  g.fillStyle = '#7fb4ff'; g.fillRect(hx - 0.06, hy, 0.12, 0.09);
  g.restore();
}

/** Pancarta de protesta (palo + tela) con un pequeño balanceo. */
export function drawBanner(g: CanvasRenderingContext2D, x: number, y: number, size: number, sway: number, color: string) {
  g.save();
  g.translate(x, y); g.rotate(sway); g.scale(size, size);
  g.fillStyle = '#d9cfbd'; g.fill(SPR.banner);
  g.fillStyle = color; g.fill(SPR.flag);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0.12, -0.36, 0.38, 0.05); g.fillRect(0.12, -0.27, 0.28, 0.05);
  g.restore();
}
