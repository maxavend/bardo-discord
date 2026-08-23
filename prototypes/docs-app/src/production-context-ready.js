function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    return {embedded:false, ready:true, instanceId:null, documentId:null};
  }

  let delay = 160;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const documentId = await fetchContext(instanceId);
      if (documentId) {
        return {embedded:true, ready:true, instanceId, documentId};
      }
    } catch (error) {
      console.warn(`Bardo Docs: activity context intento ${attempt + 1} falló`, error);
    }

    if (attempt < 7) {
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.8), 1200);
    }
  }

  return {embedded:true, ready:false, instanceId, documentId:null};
}
