/** Punto de entrada de la interfaz. */
import { createWorld } from '../sim/init';
import type { World } from '../sim/types';
import { App } from './app';
import { showStart } from './start';
import { h, mount } from './dom';
import { ensureHandlers } from '../sim/registry';
import { maybeShowTutorial } from './tutorial';

ensureHandlers();

const container = document.getElementById('app')!;
let app: App | null = null;

function startGame(world: World, fresh = false) {
  app?.destroy();
  app = new App(world, container, () => { app?.destroy(); app = null; boot(); }, (w) => startGame(w));
  (window as unknown as { __app: App }).__app = app;
  if (fresh) maybeShowTutorial(app);
}

function boot() {
  showStart(container, (opts) => {
    mount(container, h('div', { style: 'display:flex;align-items:center;justify-content:center;height:100%;color:#c3c2b7' }, 'Generando el mundo…'));
    setTimeout(() => startGame(createWorld(opts), true), 30);
  }, (w) => startGame(w));
}

boot();
