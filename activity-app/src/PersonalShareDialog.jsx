// Compartir un documento personal: quien es dueño decide quién puede abrir el
// enlace (nadie, leer o editar) y desde aquí lo envía con «Compartir enlace».
// Llevarlo a un canal es otra decisión, con su propia confirmación.
import {useEffect, useId, useState} from 'react';
import {Link} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {LINK_ACCESS, linkAccessOf} from './doc-space.js';

export function PersonalShareDialog({doc, onChangeAccess, onShareLink, canShareLink = true, onClose}) {
  const groupName = useId();
  const current = linkAccessOf(doc);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setSaving(null);
    setError('');
  }, [doc?.id]);

  // El cambio se aplica al elegir, como un interruptor: no hay «Guardar».
  const choose = async value => {
    if (!doc || value === current || saving) return;
    setSaving(value);
    setError('');
    try {
      await onChangeAccess(doc.id, value);
    } catch (err) {
      setError(err?.message || 'No se pudo cambiar quién puede abrir el enlace. Inténtalo de nuevo.');
    } finally {
      setSaving(null);
    }
  };

  const selected = saving || current;
  const shareDisabled = current === 'none' || Boolean(saving) || !canShareLink;

  return (
    <Dialog open={Boolean(doc)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir «{doc?.title || 'Sin título'}»</DialogTitle>
          <DialogDescription>
            Es un documento personal. Elige quién puede abrirlo con su enlace.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="share-access" aria-busy={Boolean(saving)} aria-describedby={error ? `${groupName}-error` : undefined}>
          <legend className="sr-only">Quién puede abrir el enlace</legend>
          {LINK_ACCESS.map(option => (
            <label key={option.value} className="share-access-option" data-selected={selected === option.value || undefined}>
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected === option.value}
                onChange={() => choose(option.value)}
              />
              <span className="share-access-copy">
                <strong>{option.label}</strong>
                <span>{saving === option.value ? 'Guardando…' : option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p id={`${groupName}-error`} className="share-access-error" role="alert">{error}</p>

        <DialogFooter className="share-access-footer">
          <p className="share-access-hint" aria-live="polite">
            {!canShareLink
              ? 'Para compartir el enlace, abre Bardo en Discord.'
              : current === 'none'
                ? 'Elige quién puede abrirlo para compartir el enlace.'
                : 'Quien tenga el enlace lo verá en «Compartidos contigo».'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Listo</Button>
            <Button disabled={shareDisabled} onClick={() => onShareLink(doc)}>
              <Link width={15} height={15} aria-hidden="true" /> Compartir enlace
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmación para llevar un documento personal al canal actual. */
export function MoveToChannelDialog({doc, channel, onConfirm, onCancel}) {
  const shared = linkAccessOf(doc) !== 'none';
  return (
    <AlertDialog open={Boolean(doc)} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Llevar a {channel}?</AlertDialogTitle>
          <AlertDialogDescription>
            «{doc?.title || 'Sin título'}» dejará de ser personal: lo verá y podrá editarlo quien tenga acceso a {channel}.
            {shared ? ' Su enlace actual ya no dará acceso a quien no esté en el canal.' : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(doc?.id)}>Llevar al canal</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
