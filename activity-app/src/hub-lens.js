// Refracción del lente del Hub, como el vidrio líquido de iOS 26: un mapa de
// desplazamiento para feDisplacementMap. El centro del lente amplía un poco lo
// que tiene debajo y el borde lo curva hacia adentro, como una gota de vidrio.
// Solo Chromium aplica filtros SVG en backdrop-filter (Discord de escritorio es
// Electron); en el resto el lente se levanta igual, como vidrio liso.

const SVG_NS = 'http://www.w3.org/2000/svg';
// Lente: amplía al centro y curva el borde. Cápsula: solo curva el borde, más
// ancho, para que lo que pasa por debajo se doble al llegar al canto.
const GLASSES = {
  lens: {id: 'bardo-hub-lens', bezel: 9, zoom: 1.1, saturate: 1.4},
  surface: {id: 'bardo-hub-glass', bezel: 16, zoom: 1, saturate: 1.6},
};
const MAX_MAPS = 24;
const maps = new Map();
const filters = new Map();
const currentSize = new Map();
let svg = null;

export function lensRefractionSupported() {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  return /\bChrome\//.test(ua) && !/Firefox|FxiOS|CriOS|EdgiOS/.test(ua);
}

/** Mapa de una cápsula de `width` × `height` px, en PNG (rojo = x, verde = y). */
function displacementMap(width, height, {bezel = 9, zoom = 1.1} = {}) {
  const radius = height / 2;
  const reach = width / 2 - radius;
  const offsets = new Float32Array(width * height * 2);
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - width / 2;
      const py = y + 0.5 - height / 2;
      const qx = Math.max(Math.abs(px) - reach, 0);
      const distance = Math.hypot(qx, py) || 1;
      const depth = radius - distance;
      if (depth <= 0) continue;
      // Muestrear más cerca del centro amplía lo que hay debajo.
      let dx = -px * (1 - 1 / zoom);
      let dy = -py * (1 - 1 / zoom);
      if (depth < bezel) {
        const bend = (1 - depth / bezel) ** 2 * bezel;
        dx -= Math.sign(px) * (qx / distance) * bend;
        dy -= (py / distance) * bend;
      }
      const i = (y * width + x) * 2;
      offsets[i] = dx;
      offsets[i + 1] = dy;
      max = Math.max(max, Math.abs(dx), Math.abs(dy));
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || !max) return null;
  const image = context.createImageData(width, height);
  for (let p = 0; p < width * height; p++) {
    image.data[p * 4] = Math.round(128 + (offsets[p * 2] / max) * 127);
    image.data[p * 4 + 1] = Math.round(128 + (offsets[p * 2 + 1] / max) * 127);
    image.data[p * 4 + 2] = 128;
    image.data[p * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return {href: canvas.toDataURL('image/png'), scale: max * 2};
}

function ensureFilter(glass) {
  if (filters.has(glass.id)) return filters.get(glass.id);
  if (!svg) {
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    document.body.append(svg);
  }
  const node = document.createElementNS(SVG_NS, 'filter');
  node.id = glass.id;
  for (const [name, value] of Object.entries({x: '0', y: '0', filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB'})) node.setAttribute(name, value);
  node.innerHTML = `<feImage x="0" y="0" preserveAspectRatio="none" result="field" />
    <feDisplacementMap in="SourceGraphic" in2="field" xChannelSelector="R" yChannelSelector="G" result="bent" />
    <feColorMatrix in="bent" type="saturate" values="${glass.saturate}" />`;
  svg.append(node);
  filters.set(glass.id, node);
  return node;
}

function glassFilter(glass, width, height) {
  if (!lensRefractionSupported()) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const key = `${glass.id}:${w}x${h}`;
  if (!maps.has(key)) {
    // La barra cambia de tamaño al compactarse: se guardan solo los últimos.
    if (maps.size >= MAX_MAPS) maps.delete(maps.keys().next().value);
    maps.set(key, displacementMap(w, h, glass));
  }
  const map = maps.get(key);
  if (!map) return null;
  if (currentSize.get(glass.id) !== key) {
    const node = ensureFilter(glass);
    node.setAttribute('width', String(w));
    node.setAttribute('height', String(h));
    const field = node.querySelector('feImage');
    field.setAttribute('width', String(w));
    field.setAttribute('height', String(h));
    field.setAttribute('href', map.href);
    node.querySelector('feDisplacementMap').setAttribute('scale', String(map.scale));
    currentSize.set(glass.id, key);
  }
  return `url(#${glass.id})`;
}

/**
 * Prepara el filtro del lente levantado y devuelve el valor para
 * `backdrop-filter`, o `null` si el navegador no refracta.
 */
export function lensFilter(width, height) {
  return glassFilter(GLASSES.lens, width, height);
}

/** Igual, para la cápsula de vidrio de la barra inferior. */
export function surfaceFilter(width, height) {
  return glassFilter(GLASSES.surface, width, height);
}
