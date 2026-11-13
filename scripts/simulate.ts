/**
 * Simula N turnos sin jugador e imprime métricas de "salud" del mundo.
 * Uso: npm run simulate -- [turnos] [semilla]
 */
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { worldHealth, type HealthReport } from '../src/sim/health';

const turns = Number(process.argv[2] ?? 200);
const seed = process.argv[3] ?? 'simulacion';

const t0 = Date.now();
const world = createWorld({ seed, player: null });
const tInit = Date.now() - t0;
const samples: HealthReport[] = [worldHealth(world)];
for (let i = 0; i < turns; i++) {
  advanceTurn(world);
  if ((i + 1) % 24 === 0 || i === turns - 1) samples.push(worldHealth(world));
}
const ms = Date.now() - t0;

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`Semilla "${seed}" · ${turns} turnos · init ${tInit} ms · total ${ms} ms (${(ms / turns).toFixed(1)} ms/turno)\n`);
console.log('turno  PIBmundial  crec%  infl%  petróleo  tensión  guerras  tratados  sanc  estab  aprob  NaN  muertos');
for (const s of samples) {
  console.log(
    `${pad(s.turn, 5)} ${pad(s.worldGdp.toFixed(0), 11)} ${pad(s.worldGrowth.toFixed(2), 6)} ${pad(s.worldInflation.toFixed(1), 6)} ${pad(s.oil.toFixed(1), 9)} ${pad(s.tension.toFixed(0), 8)} ${pad(s.wars, 8)} ${pad(s.treaties, 9)} ${pad(s.sanctions, 5)} ${pad(s.avgStability.toFixed(1), 6)} ${pad(s.avgApproval.toFixed(1), 6)} ${pad(s.nan, 4)} ${pad(s.dead, 8)}`,
  );
}
const last = samples[samples.length - 1];
console.log('\nExtremos al final:');
for (const l of last.extremes) console.log('  ' + l);
console.log('\nCambios de gobierno:', last.govChanges, '· Noticias:', world.news.length, '· Decisiones IA registradas:', world.aiLog.length);
console.log('\nÚltimas noticias:');
for (const n of world.news.slice(-12)) console.log(`  [${n.turn}] ${n.text}`);
const problems = last.problems;
if (problems.length) {
  console.log('\nPROBLEMAS DETECTADOS:');
  for (const p of problems) console.log('  ✗ ' + p);
  process.exitCode = 1;
} else {
  console.log('\n✓ El mundo no colapsa ni se queda estático.');
}
