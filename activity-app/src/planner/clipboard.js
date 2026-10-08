/**
 * Copies text and reports whether it worked. Inside Discord's iframe the
 * async Clipboard API can be missing or rejected by permissions policy, so it
 * falls back to a hidden textarea + execCommand('copy') (as Docs does).
 */
export async function copyTextToClipboard(text, {
  clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
  doc = typeof document !== 'undefined' ? document : undefined,
} = {}) {
  const value = String(text ?? '');
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Blocked or not focused: try the legacy path below.
    }
  }
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
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
    return Boolean(doc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
