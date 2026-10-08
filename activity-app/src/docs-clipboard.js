/**
 * Copiar texto al portapapeles dentro de la Activity. `navigator.clipboard`
 * puede no existir o rechazar el permiso dentro del iframe de Discord; en ese
 * caso se usa un textarea oculto con `execCommand('copy')`.
 * Devuelve true si se copió.
 */
export async function copyTextToClipboard(text, {clipboard = globalThis.navigator?.clipboard, doc = globalThis.document} = {}) {
  const value = String(text ?? '');
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Permiso denegado en el iframe: probar el método clásico.
    }
  }
  if (!doc?.createElement || !doc.body) return false;
  const textarea = doc.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  doc.body.appendChild(textarea);
  try {
    textarea.select();
    textarea.setSelectionRange?.(0, value.length);
    return Boolean(doc.execCommand?.('copy'));
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
