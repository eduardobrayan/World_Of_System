/** Banderas simplificadas generadas a partir de los datos (franjas, cantón y emblema). */
import type { Country } from '../sim/types';

export function flagSvg(flag: Country['flag'], w = 24, h = 16): string {
  const n = flag.stripes.length;
  let s = '';
  flag.stripes.forEach((col, i) => {
    if (flag.dir === 'h') s += `<rect x="0" y="${(i * h) / n}" width="${w}" height="${h / n + 0.5}" fill="${col}"/>`;
    else s += `<rect x="${(i * w) / n}" y="0" width="${w / n + 0.5}" height="${h}" fill="${col}"/>`;
  });
  if (flag.canton) s += `<rect x="0" y="0" width="${w * 0.42}" height="${h * 0.54}" fill="${flag.canton}"/>`;
  if (flag.emblem) s += `<circle cx="${flag.canton ? w * 0.7 : w / 2}" cy="${h / 2}" r="${h * 0.2}" fill="${flag.emblem}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${s}</svg>`;
}

export function flagEl(c: Country, w = 24, h = 16): HTMLElement {
  const span = document.createElement('span');
  span.className = 'flag';
  span.style.width = `${w}px`;
  span.style.height = `${h}px`;
  span.innerHTML = flagSvg(c.flag, w, h);
  span.title = c.name;
  return span;
}
