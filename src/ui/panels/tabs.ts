/** Registro de pestañas del panel izquierdo. */
import type { App } from '../app';
import { renderSummary } from './summary';
import { renderEconomy } from './economy';
import { renderTerritory } from './territory';
import { renderMarket } from './market';
import { renderWorld } from './world';
import { renderGovernment } from './government';
import { renderSociety } from './society';

export interface TabDef { id: string; icon: string; name: string; short?: string; render: (app: App) => HTMLElement[]; visible?: (app: App) => boolean }

const hasPlayer = (app: App) => !!app.player;

export const TABS: TabDef[] = [
  { id: 'resumen', icon: '📋', name: 'Resumen', render: renderSummary },
  { id: 'economia', icon: '💰', name: 'Economía', render: renderEconomy, visible: hasPlayer },
  { id: 'gobierno', icon: '🏛', name: 'Gobierno', render: renderGovernment, visible: hasPlayer },
  { id: 'sociedad', icon: '👥', name: 'Sociedad', render: renderSociety, visible: hasPlayer },
  { id: 'territorio', icon: '🗺', name: 'Territorio', short: 'Territ.', render: renderTerritory, visible: hasPlayer },
  { id: 'mercado', icon: '📈', name: 'Mercado', render: renderMarket },
  { id: 'mundo', icon: '📰', name: 'Mundo', render: renderWorld },
];
