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
import { updateGlobals, updatePandemic } from './globals';
import { checkGoals } from './goals';
import { updateMissions } from './missions';
import { snapshot, worldSnapshot } from './history';
import { applyAidFlows } from './init';
import { fiscalAutopilot } from './autopilot';
import { updateElections } from './elections';
import { generateEvents } from './events';
import { ensureHandlers } from './registry';
import { aiTurn } from './ai';
import { updateRelations, updateTreaties, resolveResolutions, autoResolutions } from './diplomacy';
import { expireProposals } from './diplohandlers';
import { updateWars } from './war';
import { updateIntel } from './intel';
import { updateSecurity, updateNarcoWorld } from './security';
import { updateNeeds } from './needs';
import { updateBio } from './bio';
import { updateWeapons } from './weapons';

export function advanceTurn(world: World) {
  if (world.gameOver) return;
  ensureHandlers();
  const ids = world.order.filter((id) => world.countries[id].alive);

  for (const id of ids) {
    const c = world.countries[id];
    c.shocks = [];
    c.eco.extraSpending = 0;
  }

  aiTurn(world);
  for (const w of world.wars) if (w.ceasefire > 0) w.ceasefire -= 1;
  updateRelations(world);
  updateTreaties(world);
  resolveResolutions(world);
  autoResolutions(world);
  expireProposals(world);
  applyAidFlows(world);
  updateTradeAccess(world);
  updateBio(world);
  updateMarket(world);
  updateWars(world);
  if (world.gameOver) return;
  updateIntel(world);
  updatePandemic(world);
  updateNarcoWorld(world);

  for (const id of ids) {
    const c = world.countries[id];
    if (world.player?.country !== id) fiscalAutopilot(world, c);
    updateRegions(world, c);
    updateWeapons(world, c);
    updateMilitary(world, c);
    updateSecurity(world, c);
    updateEconomy(world, c);
    updateNeeds(world, c);
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
  checkGoals(world);
  updateMissions(world);
}
