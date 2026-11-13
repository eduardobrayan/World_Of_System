/** Registro de las mecánicas especiales de las acciones (se llama una vez al arrancar). */
import { registerGovHandlers } from './govhandlers';
import { registerDiploHandlers } from './diplohandlers';

let done = false;

export function ensureHandlers() {
  if (done) return;
  done = true;
  registerGovHandlers();
  registerDiploHandlers();
}
