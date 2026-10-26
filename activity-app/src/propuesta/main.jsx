// Propuesta de identidad montada sobre la app real. Siembra los datos de
// ejemplo del portafolio, arranca src/main.jsx tal cual y agrega una sola capa
// visual (identidad.css). La estructura, las rutas y los componentes son los
// de producción; solo cambia cómo se ven.
//
// Solo lo sirve propuesta.html en desarrollo: el build no lo incluye.
import semilla from './semilla.json';

const SEMBRADO = 'bardo.propuesta.sembrado.v1';
const TOKENS = 'bardo.propuesta.tokens';

function sembrar({forzar = false} = {}) {
  try {
    if (forzar || !localStorage.getItem(SEMBRADO)) {
      const tokens = localStorage.getItem(TOKENS);
      localStorage.clear();
      for (const [clave, valor] of Object.entries(semilla.storage)) {
        localStorage.setItem(clave, typeof valor === 'string' ? valor : JSON.stringify(valor));
      }
      if (tokens) localStorage.setItem(TOKENS, tokens);
      localStorage.setItem(SEMBRADO, '1');
    }
  } catch { /* sin almacenamiento: la app arranca vacía */ }
  // En producción estos datos llegan del contexto del canal de Discord.
  for (const [clave, valor] of Object.entries(semilla.globals)) window[clave] = structuredClone(valor);
}

function leerTokens() {
  try { return localStorage.getItem(TOKENS) === 'actual' ? 'actual' : 'propuesta'; } catch { return 'propuesta'; }
}

function aplicarTokens(valor) {
  document.documentElement.dataset.identidad = valor;
  try { localStorage.setItem(TOKENS, valor); } catch { /* sin almacenamiento */ }
}

/** Interruptor Antes / Propuesta, fuera del árbol de React de la app. */
function montarInterruptor() {
  const panel = document.createElement('div');
  panel.className = 'propuesta-interruptor';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Comparar identidad visual');
  const botones = [['actual', 'Antes'], ['propuesta', 'Propuesta']].map(([valor, texto]) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = texto;
    boton.addEventListener('click', () => {
      aplicarTokens(valor);
      botones.forEach(otro => otro.setAttribute('aria-pressed', String(otro === boton)));
    });
    boton.setAttribute('aria-pressed', String(leerTokens() === valor));
    return boton;
  });
  const reiniciar = document.createElement('button');
  reiniciar.type = 'button';
  reiniciar.textContent = 'Reiniciar datos';
  reiniciar.addEventListener('click', () => { sembrar({forzar: true}); location.reload(); });
  panel.append(...botones, reiniciar);
  document.body.append(panel);
}

sembrar();
aplicarTokens(leerTokens());
// La capa de identidad va antes que la app para que también vista la pantalla
// de carga; sus reglas ganan por especificidad (html[data-identidad]), no por
// orden. El corte óptico de Inter va al final: si no, el @font-face sin eje
// que importa la app lo reemplazaría.
await import('./identidad.css');
await import('../main.jsx');
await import('@fontsource-variable/inter/opsz.css');
montarInterruptor();
