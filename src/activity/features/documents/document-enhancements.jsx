import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog.jsx';
import { Input, Textarea } from '../../components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select.jsx';
import { MemberPicker } from '../../components/bardo/member-picker.jsx';

function selectedText() {
  const selection = window.getSelection();
  const body = document.querySelector('#document-body');
  if (!selection || selection.isCollapsed || !selection.rangeCount || !body?.contains(selection.getRangeAt(0).commonAncestorContainer)) return '';
  return selection.toString().replace(/\s+/g, ' ').trim().slice(0, 500);
}

export default function DocumentTaskDialog({ documentId, onFinished }) {
  const [open, setOpen] = useState(true);
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState('');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [member, setMember] = useState(null);
  const [status, setStatus] = useState('idle');
  const [dirty, setDirty] = useState(false);

  const prepare = async (signal) => {
    const selection = selectedText();
    setTitle((selection.split(/[.!?\n]/)[0] || document.querySelector('#document-title')?.textContent || 'Nueva tarea').slice(0, 120));
    setContext(selection);
    setDueAt('');
    setMember(null);
    setDirty(false);
    setStatus('loading');
    try {
      const response = await fetch('/api/home/boards?limit=12', { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const nextBoards = Array.isArray(payload.items) ? payload.items : [];
      setBoards(nextBoards);
      setBoardId(nextBoards[0]?.id || '');
      setStatus(nextBoards.length ? 'ready' : 'empty');
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('error');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void prepare(controller.signal);
    return () => controller.abort();
  }, []);

  const requestClose = (nextOpen) => {
    if (nextOpen) { setOpen(true); return; }
    if (status === 'saving') return;
    if (dirty && !window.confirm('¿Descartar los cambios de esta tarea?')) return;
    setOpen(false);
    onFinished();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!documentId || !boardId || !title.trim()) return;
    setStatus('saving');
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          title: title.trim(),
          assigneeId: member?.userId || null,
          assigneeName: member?.displayName || null,
          dueAt: dueAt || null,
          excerpt: context.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No pudimos crear la tarea.');
      setOpen(false);
      onFinished();
      setStatus('ready');
      document.dispatchEvent(new CustomEvent('bardo:document-task-changed'));
      globalThis.__bardoToast?.success('Tarea creada', {
        description: `Se agregó a ${payload.board?.name || 'tu tablero'}.`,
        action: payload.task?.id ? {
          label: 'Deshacer',
          onClick: async () => {
            const undo = await fetch(`/api/documents/${encodeURIComponent(documentId)}/tasks/${encodeURIComponent(payload.task.id)}`, { method: 'DELETE' });
            if (undo.ok) document.dispatchEvent(new CustomEvent('bardo:document-task-changed'));
          },
        } : undefined,
      });
    } catch (error) {
      setStatus('error');
      globalThis.__bardoToast?.error(error.message || 'No pudimos crear la tarea.');
    }
  };

  return (
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="bardo-document-task-dialog" showClose={status !== 'saving'}>
          <DialogTitle className="bardo-dialog-title">Crear tarea</DialogTitle>
          <DialogDescription className="bardo-dialog-description">Convierte el contexto seleccionado en una tarea vinculada a este documento.</DialogDescription>
          <form className="bardo-dialog-form" onSubmit={submit}>
            <label className="bardo-field"><span className="bardo-field-label">Título</span><Input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} maxLength={120} autoFocus required /></label>
            <label className="bardo-field"><span className="bardo-field-label">Tablero</span><Select value={boardId} onValueChange={(value) => { setBoardId(value); setDirty(true); }} disabled={status === 'loading'}><SelectTrigger>{boards.find((board) => board.id === boardId)?.name || (status === 'loading' ? 'Cargando tableros…' : 'Selecciona un tablero')}</SelectTrigger><SelectContent>{boards.map((board) => <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>)}</SelectContent></Select></label>
            <MemberPicker value={member} onValueChange={(value) => { setMember(value); setDirty(true); }} />
            <label className="bardo-field"><span className="bardo-field-label">Fecha límite <small>Opcional</small></span><Input type="date" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setDirty(true); }} /></label>
            <label className="bardo-field"><span className="bardo-field-label">Contexto <small>Opcional</small></span><Textarea value={context} onChange={(event) => { setContext(event.target.value); setDirty(true); }} rows={3} placeholder="Añade el contexto necesario para resolverla." /></label>
            {status === 'empty' ? <p className="bardo-dialog-error" role="status">Crea un tablero antes de agregar esta tarea.</p> : null}
            {status === 'error' ? <p className="bardo-dialog-error" role="alert">No pudimos preparar el formulario. Reintenta.</p> : null}
            <footer className="bardo-dialog-actions"><Button type="button" variant="ghost" onClick={() => requestClose(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={status === 'saving' || status === 'loading' || !boardId || !title.trim()}>{status === 'saving' ? 'Creando…' : 'Crear tarea'}</Button></footer>
          </form>
        </DialogContent>
      </Dialog>
  );
}
