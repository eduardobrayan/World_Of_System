/** Punto de entrada de la interfaz. */
import { createWorld } from '../sim/init';
import type { World } from '../sim/types';
import { App } from './app';
import { showStart } from './start';
import { h, mount } from './dom';

const container = document.getElementById('app')!;
let app: App | null = null;

function startGame(world: World) {
  app?.destroy();
  app = new App(world, container, () => { app?.destroy(); app = null; boot(); });
  (window as unknown as { __app: App }).__app = app;
}

function boot() {
  showStart(container, (opts) => {
    mount(container, h('div', { style: 'display:flex;align-items:center;justify-content:center;height:100%;color:#c3c2b7' }, 'Generando el mundo…'));
    setTimeout(() => startGame(createWorld(opts)), 30);
  }, (w) => startGame(w));
}

boot();
