/** Tutorial breve: pasos que explican la interfaz y los sistemas clave. */
import type { App } from './app';
import { h, modal } from './dom';

const STEPS: { title: string; text: string; tab?: string }[] = [
  { title: 'Bienvenido al gobierno', text: 'Diriges un país real desde enero de 2026 y el tiempo corre solo: los días avanzan y el mundo se actualiza cada mes. Tus decisiones tienen efectos inmediatos, retardados y a veces ocultos, y el resto del mundo reacciona a ellas.' },
  { title: 'La barra superior', text: 'Muestra la fecha (con los días corriendo), la velocidad del tiempo (pausa con la barra espaciadora; velocidades 1, 2 y 3 con esas teclas) y tus indicadores clave. Pasa el ratón por cualquier indicador para ver qué lo está modificando ahora mismo. ⚡ es tu capital político: lo gastas en cada acción y se recarga cada mes (más si eres popular).' },
  { title: 'El mapa', text: 'Haz clic en un país para ver sus datos (con "≈" si tu información es aproximada) y actuar sobre él. Doble clic abre su mapa local con regiones, ciudades y obras. Cambia de capa (alianzas, relaciones, renta, estabilidad, conflictos…) con los botones superiores.' },
  { title: 'Economía', text: 'Ajusta el presupuesto y los impuestos con los botones de paso y usa la previsión a 12 meses para ver el efecto antes de aprobarlo. El parlamento puede rechazarlo si no tienes mayoría.', tab: 'economia' },
  { title: 'Gobierno y sociedad', text: 'Cambia políticas, aprueba leyes y nombra ministros. Seis grupos sociales (trabajadores, empresarios, militares, jóvenes, religiosos y minorías) reaccionan a todo. Su apoyo decide tu aprobación; su influencia, tu estabilidad. Si pierdes las elecciones, un golpe o una revolución, la partida termina.', tab: 'gobierno' },
  { title: 'Diplomacia e IA', text: 'Cada país tiene personalidad y memoria: recuerda tus ayudas, amenazas y traiciones. Antes de proponer algo verás su probabilidad de aceptar y los motivos. En el registro de la IA puedes leer por qué cada país tomó sus decisiones.', tab: 'diplomacia' },
  { title: 'Sociedad y seguridad', text: 'En Sociedad verás las necesidades civiles (alimentación, vivienda, energía, empleo…): si caen por debajo de lo habitual, crece la presión social. En Seguridad gestionas la policía, seis tipos de corrupción y el narcotráfico.', tab: 'seguridad' },
  { title: 'Defensa', text: 'Gestiona fuerzas, movilización y despliegues. Las guerras se resuelven por frentes: logística, terreno, moral, tecnología y aliados cuentan. Negocia la paz con las condiciones que quieras. La escalada nuclear es posible… y catastrófica. En Armamento diseñas o compras tus propias armas, y existe la tentación de un programa secreto de armas biológicas.', tab: 'militar' },
  { title: 'Inteligencia, tecnología y objetivos', text: 'Lanza operaciones encubiertas (con riesgo de ser descubierto), elige investigaciones y vigila tu objetivo de partida. Los acontecimientos pueden sugerirte cambiar de objetivo. Guarda la partida desde el menú ☰.', tab: 'objetivos' },
  { title: 'Eventos', text: 'Los asuntos críticos detienen el reloj y abren una ventana con varias opciones. Los demás llegan a la bandeja inferior: tienes un mes para decidir o tu gabinete elegirá por ti. Tus acciones se aplican al instante. Al cerrar el tutorial, el tiempo empieza a correr.' },
];

export function showTutorial(app: App, step = 0) {
  const s = STEPS[step];
  if (s.tab) app.setTab(s.tab);
  app.modalOpen++;
  let close = () => undefined as void;
  close = modal({
    title: s.title, kicker: `Tutorial ${step + 1}/${STEPS.length}`, onClose: () => { app.modalOpen = Math.max(0, app.modalOpen - 1); },
    body: h('p', { style: 'font-size:15px' }, s.text),
    footer: [
      h('button', { class: 'btn ghost', onclick: () => { close(); try { localStorage.setItem('wos:tutorial', 'visto'); } catch { /* sin almacenamiento */ } } }, 'Saltar tutorial'),
      step > 0 ? h('button', { class: 'btn', onclick: () => { close(); showTutorial(app, step - 1); } }, '◀ Anterior') : null,
      step < STEPS.length - 1
        ? h('button', { class: 'btn primary', onclick: () => { close(); showTutorial(app, step + 1); } }, 'Siguiente ▶')
        : h('button', { class: 'btn primary', onclick: () => { close(); try { localStorage.setItem('wos:tutorial', 'visto'); } catch { /* sin almacenamiento */ } } }, '¡A gobernar!'),
    ],
  });
}

export function maybeShowTutorial(app: App) {
  let seen = false;
  try { seen = localStorage.getItem('wos:tutorial') === 'visto'; } catch { seen = false; }
  if (!seen && app.player) setTimeout(() => showTutorial(app), 600);
}
