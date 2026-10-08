import {expect} from '@playwright/test';

// Claves de localStorage en modo standalone (sin ámbito de canal), ver src/docs-storage.js.
export const STORE_KEY = 'bardo.docs.heroui.v1';
export const LAST_OPENED_KEY = 'bardo.docs.heroui.last-opened.v1';

export const testDocument = {
  id: 'stress-monster',
  title: 'Stress test · Documento monstruo de 30 secciones',
  description: 'Un documento deliberadamente enorme para llevar scroll, sticky y toolbar al límite.',
  origin: 'QA de producto',
  createdAt: '2026-08-24T12:00:00.000Z',
  updatedAt: '2026-08-24T12:00:00.000Z',
  body: Array.from({length: 30}, (_, index) => `<p>Sección ${index + 1}: Documento de validación cargado con contenido heterogéneo para probar scroll, sticky, selección, guardado y renderizado.</p>`).join(''),
};

let docCounter = 0;

/** Documento local mínimo (como los que crea la app en modo standalone). */
export function makeDoc({title, body = '<p><br></p>', ...rest}) {
  docCounter += 1;
  return {
    id: `seed-${docCounter}-${title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`,
    title,
    description: '',
    body,
    origin: 'Creado en Bardo',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: `2026-09-01T12:${String(docCounter % 60).padStart(2, '0')}:00.000Z`,
    ...rest,
  };
}

/**
 * Deja localStorage con exactamente estos documentos y recarga. No usa
 * addInitScript a propósito: así un `page.reload()` posterior conserva lo que
 * la app haya guardado.
 */
export async function seedDocs(page, docs, {lastOpenedId = null, hash = '#docs'} = {}) {
  await page.goto(`/?theme=dark${hash}`);
  await page.evaluate(({docs: items, lastOpenedId: openedId, storeKey, lastOpenedKey}) => {
    localStorage.clear();
    localStorage.setItem(storeKey, JSON.stringify({version: 1, docs: items, deletedIds: []}));
    if (openedId) localStorage.setItem(lastOpenedKey, JSON.stringify({id: openedId, offset: 0, at: Date.now()}));
  }, {docs, lastOpenedId, storeKey: STORE_KEY, lastOpenedKey: LAST_OPENED_KEY});
  await page.reload();
}

export function seedLocalDocument(page) {
  return page.evaluate(({documentData, storeKey}) => {
    localStorage.clear();
    localStorage.setItem(storeKey, JSON.stringify({
      version: 1,
      docs: [documentData],
      deletedIds: [],
    }));
  }, {documentData: testDocument, storeKey: STORE_KEY});
}

/** Errores de ejecución (pageerror + console.error), sin el ruido del favicon. */
export function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

/** Biblioteca de Documentos lista (cabecera "Bardo" + pestaña de activos). */
export async function expectLibrary(page, activeCount) {
  const name = activeCount === undefined ? /^Activos \(\d+\)$/ : `Activos (${activeCount})`;
  await expect(page.getByRole('button', {name, exact: true})).toBeVisible();
}

/** Abre un documento desde su fila de la biblioteca y espera el lector. */
export async function openDocFromLibrary(page, title) {
  await page.locator('.doc-row-main').filter({hasText: title}).click();
  await expect(page.locator('h1.doc-title')).toHaveText(title);
}

/**
 * Ejecuta una acción de la barra del editor: si el botón está a la vista se
 * pulsa; si la barra adaptable la mandó a "Ver más", se usa el menú.
 */
export async function runToolbarAction(page, name) {
  const toolbar = page.getByRole('toolbar', {name: 'Barra de herramientas del editor'});
  // Mientras se cierra otro menú, Radix oculta la barra a la accesibilidad: esperar a que vuelva.
  await expect(toolbar.getByRole('button', {name: 'Ver más'})).toBeVisible();
  const inline = toolbar.getByRole('button', {name, exact: true});
  if (await inline.isVisible()) {
    await inline.click();
    return 'inline';
  }
  await toolbar.getByRole('button', {name: 'Ver más'}).click();
  await page.getByRole('menuitem', {name, exact: true}).click();
  return 'menu';
}

/** Selecciona (con la selección del DOM, que Slate adopta) un texto del cuerpo editable. */
export async function selectEditorText(page, text, {wholeBlock = false} = {}) {
  await page.evaluate(({targetText, selectWholeBlock}) => {
    const body = document.querySelector('.editable-body');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.textContent.includes(targetText)) node = walker.nextNode();
    if (!node) throw new Error(`No text node contains: ${targetText}`);
    const range = document.createRange();
    if (selectWholeBlock) {
      range.setStart(node, 0);
      range.setEnd(node, node.textContent.length);
    } else {
      const start = node.textContent.indexOf(targetText);
      range.setStart(node, start);
      range.setEnd(node, start + targetText.length);
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, {targetText: text, selectWholeBlock: wholeBlock});
  // slate-react adopta la selección del DOM con un throttle de 100 ms.
  await page.waitForTimeout(150);
}

/** Deja el cursor justo después de `text` en el cuerpo editable (sin depender de Home/End del SO). */
export async function placeCaretAfter(page, text) {
  await page.locator('.editable-body').getByText(text).first().click();
  // slate-react sincroniza la selección del DOM con un throttle de 100 ms y puede
  // reponer la suya tras el clic: fijarla hasta que quede donde se pidió.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(targetText => {
      const body = document.querySelector('.editable-body');
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.textContent.includes(targetText)) node = walker.nextNode();
      if (!node) throw new Error(`No text node contains: ${targetText}`);
      const offset = node.textContent.indexOf(targetText) + targetText.length;
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    }, text);
    await page.waitForTimeout(150);
    const placed = await page.evaluate(targetText => {
      const selection = window.getSelection();
      const node = selection.anchorNode;
      return Boolean(selection.isCollapsed && node?.textContent?.includes(targetText)
        && selection.anchorOffset === node.textContent.indexOf(targetText) + targetText.length);
    }, text);
    if (placed) return;
  }
  throw new Error(`El cursor no quedó después de: ${text}`);
}

/**
 * Contraste WCAG entre el color del texto de un elemento y el fondo efectivo
 * detrás de él (compone fondos semitransparentes de los ancestros). Usa un
 * canvas para convertir cualquier color CSS (lab, oklch…) a sRGB.
 */
export function contrastAgainstBackground(locator) {
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const toRgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'rgba(0, 0, 0, 0)';
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return {r, g, b, a: a / 255};
    };
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const background = toRgba(getComputedStyle(node).backgroundColor);
      if (background.a > 0) layers.push(background);
      if (background.a >= 1) break;
    }
    const canvasColor = document.documentElement.dataset.theme === 'dark' ? {r: 0, g: 0, b: 0, a: 1} : {r: 255, g: 255, b: 255, a: 1};
    const background = layers.reverse().reduce((base, layer) => over(layer, base), canvasColor);
    const text = over(toRgba(getComputedStyle(element).color), background);
    const luminance = ({r, g, b}) => {
      const channel = value => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

/** Desborde horizontal del documento (debe ser 0 en cualquier ancho). */
export function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
