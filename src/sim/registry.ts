/** Registro de las mecánicas especiales de las acciones (se llama una vez al arrancar). */
import { registerGovHandlers } from './govhandlers';
import { registerDiploHandlers } from './diplohandlers';
import { registerMilHandlers } from './milhandlers';
import { registerIntelHandlers } from './intel';
import { registerBioHandlers } from './bio';
import { registerWeaponHandlers } from './weapons';
import { registerSecurityHandlers } from './sechandlers';

let done = false;

export function ensureHandlers() {
  if (done) return;
  done = true;
  registerGovHandlers();
  registerDiploHandlers();
  registerMilHandlers();
  registerIntelHandlers();
  registerBioHandlers();
  registerWeaponHandlers();
  registerSecurityHandlers();
}
