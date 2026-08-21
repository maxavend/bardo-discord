import './ui/runtime.js';
import './security-bootstrap.js';
import './resource-polling.js';

const params = new URLSearchParams(window.location.search);

function modeFromTarget(value) {
  const target = String(value || '').trim();
  if (!target) return null;
  if (target.startsWith('bardo:home:') || target.startsWith('home:')) return 'home';
  if (target.startsWith('bardo:board:') || target.startsWith('board:')) return 'board';
  if (target.startsWith('bardo:event:') || target.startsWith('event:')) return 'event';
  if (target.startsWith('bardo:open:') || target.startsWith('document:')) return 'document';
  return null;
}

function directMode() {
  if (params.get('document') || params.get('id')) return 'document';
  if (params.get('board')) return 'board';
  if (params.get('event')) return 'event';
  if (params.get('home') === '1') return 'home';
  const custom = params.get('custom_id');
  return modeFromTarget(custom);
}

async function resolveContextMode() {
  const direct = directMode();
  if (direct) return direct;
  const auth = await globalThis.__bardoActivityAuth?.ready;
  const sdkMode = modeFromTarget(auth?.sdk?.customId);
  if (sdkMode) return sdkMode;
  const instanceId = auth?.instanceId || params.get('instance_id');
  if (!instanceId) return 'document';
  try {
    const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return 'document';
    const context = await response.json();
    globalThis.__bardoResolvedActivityContext = context;
    return modeFromTarget(context?.documentId) || 'document';
  } catch {
    return 'document';
  }
}

async function loadDocumentModule() {
  await import('./editor-reliability.js');
  await import('./import-bootstrap.js');
  await import('./app.js');
  await import('./export-security.js');
}

async function boot() {
  const mode = await resolveContextMode();
  document.documentElement.dataset.bardoBootMode = mode;

  if (mode === 'board') {
    await import('./board.js');
    await import('./member-picker-remote.js');
  } else if (mode === 'event') {
    await import('./event.js');
    await import('./planner-member-directory.js');
  } else if (mode === 'document') {
    await loadDocumentModule();
  }

  await import('./ui/migration-adapters.js');
  await import('./product-integration.js');
}

boot().catch((error) => {
  console.error('No se pudo iniciar el módulo de Bardo:', error);
  document.documentElement.dataset.bardoBootError = 'true';
});
