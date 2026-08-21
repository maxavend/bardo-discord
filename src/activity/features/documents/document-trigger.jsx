import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare2 } from 'lucide-react';
import { Button } from '../../components/ui/button.jsx';

const DocumentTaskDialog = lazy(() => import('./document-enhancements.jsx'));

function currentDocumentId() {
  const params = new URLSearchParams(location.search);
  const contextId = globalThis.__bardoResolvedActivityContext?.documentId;
  const customId = globalThis.__bardoActivityAuth?.state?.sdk?.customId || params.get('custom_id');
  const customDocumentId = String(customId || '').replace(/^(?:bardo:open:|document:)/, '');
  const id = contextId || params.get('document') || params.get('id') || customDocumentId;
  return id && !String(id).startsWith('bardo:') ? String(id) : null;
}

export default function DocumentTrigger() {
  const [actions, setActions] = useState(null);
  const [open, setOpen] = useState(false);
  const documentId = useMemo(currentDocumentId, []);
  useEffect(() => {
    const find = () => setActions(document.querySelector('.document-actions'));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  if (!actions || !documentId) return null;
  return createPortal(
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><CheckSquare2 aria-hidden="true" size={16} />Crear tarea</Button>
      {open ? <Suspense fallback={null}><DocumentTaskDialog documentId={documentId} onFinished={() => setOpen(false)} /></Suspense> : null}
    </>,
    actions,
  );
}
