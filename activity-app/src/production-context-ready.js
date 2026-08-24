const BARDO_OPEN_PREFIX = 'bardo:open:';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeLaunchDocument(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(BARDO_OPEN_PREFIX)) {
    const id = trimmed.slice(BARDO_OPEN_PREFIX.length).trim();
    return id || null;
  }
  return trimmed;
}

async function fetchContext(instanceId) {
  if (!instanceId) return null;
  const response = await fetch(`/api/activity-context/${encodeURIComponent(instanceId)}`, {
    headers:{Accept:'application/json'},
    cache:'no-store',
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return typeof payload?.documentId === 'string' && payload.documentId.trim()
    ? payload.documentId.trim()
    : null;
}

export async function waitForBardoActivityContext() {
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get('instance_id')?.trim() || null;
  const embedded = Boolean(instanceId && params.get('frame_id'));

  if (!embedded) {
    return {embedded:false, ready:true, instanceId:null, documentId:null, customId:null};
  }

  // Discord injects the originating message component custom_id into the
  // Activity launch URL. It is the most direct link to the document and is
  // available before the server-side activity context callback settles.
  const customId = params.get('custom_id')?.trim() || null;
  const directDocumentId = normalizeLaunchDocument(
    customId || params.get('document') || params.get('id'),
  );

  if (directDocumentId) {
    return {
      embedded:true,
      ready:true,
      instanceId,
      documentId:directDocumentId,
      customId:customId || `${BARDO_OPEN_PREFIX}${directDocumentId}`,
      source:'launch-custom-id',
    };
  }

  let delay = 160;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const documentId = await fetchContext(instanceId);
      if (documentId) {
        return {embedded:true, ready:true, instanceId, documentId, customId:null, source:'activity-context'};
      }
    } catch (error) {
      console.warn(`Bardo Docs: activity context intento ${attempt + 1} falló`, error);
    }

    if (attempt < 7) {
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.8), 1200);
    }
  }

  return {embedded:true, ready:false, instanceId, documentId:null, customId:null};
}
