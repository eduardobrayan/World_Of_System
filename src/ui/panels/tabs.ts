/** Registro de pestañas del panel izquierdo. */
import type { App } from '../app';
import { renderSummary } from './summary';
import { renderCommand } from './command';
import { renderEconomy } from './economy';
import { renderTerritory } from './territory';
import { renderMarket } from './market';
import { renderWorld } from './world';
import { renderGovernment } from './government';
import { renderSociety } from './society';
import { renderDiplomacy } from './diplomacy';
import { renderMilitar } from './militar';
import { renderIntel } from './intel';
import { renderTech } from './tech';
import { renderObjectives } from './objectives';
import { renderSecurity } from './security';
import { renderArmament } from './armament';

export interface TabDef { id: string; icon: string; name: string; short?: string; render: (app: App) => HTMLElement[]; visible?: (app: App) => boolean }

const hasPlayer = (app: App) => !!app.player;

export const TABS: TabDef[] = [
  { id: 'mando', icon: '🎛', name: 'Panel de mando', short: 'Mando', render: renderCommand },
  { id: 'resumen', icon: '📋', name: 'Resumen', render: renderSummary },
  { id: 'economia', icon: '💰', name: 'Economía', render: renderEconomy, visible: hasPlayer },
  { id: 'gobierno', icon: '🏛', name: 'Gobierno', render: renderGovernment, visible: hasPlayer },
  { id: 'sociedad', icon: '👥', name: 'Sociedad', render: renderSociety, visible: hasPlayer },
  { id: 'diplomacia', icon: '🤝', name: 'Diplomacia', short: 'Diplom.', render: renderDiplomacy, visible: hasPlayer },
  { id: 'seguridad', icon: '🚓', name: 'Seguridad', short: 'Segur.', render: renderSecurity, visible: hasPlayer },
  { id: 'militar', icon: '🎖', name: 'Defensa', render: renderMilitar, visible: hasPlayer },
  { id: 'armamento', icon: '🛠', name: 'Armamento', short: 'Armas', render: renderArmament, visible: hasPlayer },
  { id: 'inteligencia', icon: '🕵', name: 'Inteligencia', short: 'Intelig.', render: renderIntel, visible: hasPlayer },
  { id: 'tecnologia', icon: '🔬', name: 'Tecnología', short: 'Tecnol.', render: renderTech, visible: hasPlayer },
  { id: 'territorio', icon: '🗺', name: 'Territorio', short: 'Territ.', render: renderTerritory, visible: hasPlayer },
  { id: 'mercado', icon: '📈', name: 'Mercado', render: renderMarket },
  { id: 'mundo', icon: '📰', name: 'Mundo', render: renderWorld },
  { id: 'objetivos', icon: '🎯', name: 'Objetivos', short: 'Objet.', render: renderObjectives, visible: hasPlayer },
];

/** Secciones grandes del panel izquierdo (agrupan las pestañas; las subpestañas solo aparecen si hay varias). */
export interface SectionDef { id: string; icon: string; name: string; short: string; tabs: string[] }
export const SECTIONS: SectionDef[] = [
  { id: 'mando', icon: '🎛', name: 'Panel de mando', short: 'Mando', tabs: ['mando'] },
  { id: 'gobierno', icon: '🏛', name: 'Gobierno y economía', short: 'Gobierno', tabs: ['economia', 'gobierno', 'mercado', 'objetivos'] },
  { id: 'sociedad', icon: '👥', name: 'Sociedad y seguridad', short: 'Sociedad', tabs: ['sociedad', 'seguridad', 'territorio'] },
  { id: 'mundo', icon: '🌍', name: 'Mundo y diplomacia', short: 'Mundo', tabs: ['diplomacia', 'inteligencia', 'mundo'] },
  { id: 'ejercito', icon: '🎖', name: 'Ejército', short: 'Ejército', tabs: ['militar', 'armamento'] },
  { id: 'tecnologia', icon: '🔬', name: 'Tecnología', short: 'Tecnol.', tabs: ['tecnologia'] },
];
export const SECTION_OF: Record<string, SectionDef> = Object.fromEntries(SECTIONS.flatMap((s) => s.tabs.map((t) => [t, s])));
