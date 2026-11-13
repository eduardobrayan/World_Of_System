/** Orquestador del turno mensual. */
import type { World } from './types';
import { updateMarket, updateTradeAccess } from './market';
import { updateEconomy } from './economy';
import { updateSociety } from './society';
import { updatePolitics } from './politics';
import { updateRegions } from './regions';
import { updateMilitary } from './military';
import { updateTech } from './tech';
import { processScheduled, tickModifiers } from './effects';
import { updateGlobals } from './globals';
import { snapshot, worldSnapshot } from './history';
import { applyAidFlows } from './init';
import { fiscalAutopilot } from './autopilot';
import { updateElections } from './elections';
import { generateEvents } from './events';
import { ensureHandlers } from './registry';

export function advanceTurn(world: World) {
  if (world.gameOver) return;
  ensureHandlers();
  const ids = world.order.filter((id) => world.countries[id].alive);

  for (const id of ids) {
    const c = world.countries[id];
    c.shocks = [];
    c.eco.extraSpending = 0;
  }

  applyAidFlows(world);
  updateTradeAccess(world);
  updateMarket(world);

  for (const id of ids) {
    const c = world.countries[id];
    if (world.player?.country !== id) fiscalAutopilot(world, c);
    updateRegions(world, c);
    updateMilitary(world, c);
    updateEconomy(world, c);
    updateSociety(world, c);
    updatePolitics(world, c);
    updateTech(world, c);
  }
  for (const id of ids) {
    if (world.gameOver) break;
    updateElections(world, world.countries[id]);
  }

  updateGlobals(world);
  world.turn += 1;
  processScheduled(world);
  for (const id of ids) tickModifiers(world.countries[id]);
  for (const id of ids) snapshot(world, world.countries[id]);
  worldSnapshot(world);
  if (!world.gameOver) generateEvents(world);
}
