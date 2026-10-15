import {useEffect, useState} from 'react';
import {RotateCcw, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {Field, FieldLabel} from '@/components/ui/field';
import {IconButton} from '@/components/ui/icon-button.jsx';
import {cn} from '@/lib/utils';
import {KANBAN_LIMITS, KANBAN_TAG_COLORS} from './kanban-shared.js';
import {TAG_COLOR_HEX, TAG_COLOR_LABELS, TagChip} from './kanban-ui.jsx';

/** Nombre de una columna nueva o renombrada. */
export function ColumnNameDialog({open, title, submitLabel, initialName = '', onSubmit, onClose}) {
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);
  const value = name.trim();
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-5"
          onSubmit={event => {
            event.preventDefault();
            if (!value) return;
            onSubmit(value.slice(0, KANBAN_LIMITS.columnName));
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="kanban-column-name" className="sr-only">Nombre</FieldLabel>
            <Input id="kanban-column-name" autoFocus value={name} maxLength={KANBAN_LIMITS.columnName} onChange={event => setName(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!value}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Eliminar una columna: si tiene tareas, pide a dónde moverlas. */
export function DeleteColumnDialog({column, columns, cardCount, onConfirm, onClose}) {
  const targets = columns.filter(item => item.id !== column?.id);
  const [moveTo, setMoveTo] = useState(targets[0]?.id || null);
  useEffect(() => {
    if (column) setMoveTo(columns.find(item => item.id !== column.id && !item.isDone)?.id || targets[0]?.id || null);
  }, [column?.id]);
  return (
    <AlertDialog open={Boolean(column)} onOpenChange={next => { if (!next) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar la columna «{column?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            {cardCount > 0
              ? `${cardCount === 1 ? 'Su tarea se moverá' : `Sus ${cardCount} tareas se moverán`} a la columna que elijas.`
              : 'La columna está vacía, así que no se mueve ninguna tarea.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {cardCount > 0 && (
          <div role="radiogroup" aria-label="Mover sus tareas a" className="flex flex-col gap-1">
            {targets.map(target => (
              <button
                key={target.id}
                type="button"
                role="radio"
                aria-checked={moveTo === target.id}
                onClick={() => setMoveTo(target.id)}
                className={cn(
                  'flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  moveTo === target.id ? 'border-primary bg-primary/5 font-medium' : 'border-border/70 hover:bg-accent',
                )}
              >
                <span className="truncate">{target.name}</span>
                {moveTo === target.id && <span className="text-xs text-primary">Destino</span>}
              </button>
            ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={cardCount > 0 && !moveTo} onClick={() => onConfirm(column.id, cardCount > 0 ? moveTo : null)}>
            Eliminar columna
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ArchivedCardsDialog({open, loadArchived, onRestore, onClose, remote}) {
  const [state, setState] = useState({loading: false, cards: [], error: null});
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState({loading: true, cards: [], error: null});
    loadArchived()
      .then(cards => { if (!cancelled) setState({loading: false, cards, error: null}); })
      .catch(error => { if (!cancelled) setState({loading: false, cards: [], error: error?.message || 'No se pudieron cargar las tareas archivadas. Revisa tu conexión e inténtalo de nuevo.'}); });
    return () => { cancelled = true; };
  }, [open, loadArchived]);
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tareas archivadas</DialogTitle>
        </DialogHeader>
        {!remote ? (
          <p className="text-sm text-muted-foreground">En este dispositivo, archivar solo se puede deshacer en el momento.</p>
        ) : state.loading ? (
          <p className="text-sm text-muted-foreground" role="status">Cargando tareas archivadas…</p>
        ) : state.error ? (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        ) : state.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tareas archivadas en este canal.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {state.cards.map(card => (
              <li key={card.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                <span className="text-xs tabular-nums text-muted-foreground">#{card.number}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{card.title}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => {
                    onRestore(card);
                    setState(previous => ({...previous, cards: previous.cards.filter(item => item.id !== card.id)}));
                  }}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" /> Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TagsDialog({open, tags, onAdd, onUpdate, onDelete, onClose}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const full = tags.length >= KANBAN_LIMITS.tags;
  const value = name.trim();
  const duplicate = tags.some(tag => tag.name.toLowerCase() === value.toLowerCase());
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Etiquetas del tablero</DialogTitle>
          <DialogDescription>Borrar una etiqueta la quita de sus tareas.</DialogDescription>
        </DialogHeader>
        {tags.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {tags.map(tag => (
              <li key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-2.5 py-1.5">
                <TagChip tag={tag} />
                <div className="ml-auto flex items-center gap-0.5" role="radiogroup" aria-label={`Color de la etiqueta ${tag.name}`}>
                  {KANBAN_TAG_COLORS.map(option => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={tag.color === option}
                      aria-label={TAG_COLOR_LABELS[option]}
                      onClick={() => onUpdate(tag.id, {color: option})}
                      className={cn('size-4 rounded-full border-2', tag.color === option ? 'border-foreground' : 'border-transparent')}
                      style={{backgroundColor: TAG_COLOR_HEX[option]}}
                    />
                  ))}
                </div>
                <IconButton label={`Eliminar etiqueta ${tag.name}`} size="icon-xs" onClick={() => onDelete(tag.id)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay etiquetas.</p>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={event => {
            event.preventDefault();
            if (!value || full || duplicate) return;
            onAdd(value.slice(0, KANBAN_LIMITS.tagName), color);
            setName('');
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              value={name}
              disabled={full}
              maxLength={KANBAN_LIMITS.tagName}
              onChange={event => setName(event.target.value)}
              placeholder={full ? `Máximo ${KANBAN_LIMITS.tags} etiquetas` : 'Nueva etiqueta'}
              aria-label="Nombre de la nueva etiqueta"
              aria-invalid={duplicate || undefined}
              className="h-9"
            />
            <Button type="submit" disabled={!value || full || duplicate}>Agregar</Button>
          </div>
          {duplicate && <p className="text-xs text-destructive">Ya existe una etiqueta con ese nombre.</p>}
          {!full && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color de la nueva etiqueta">
              {KANBAN_TAG_COLORS.map(option => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  aria-label={TAG_COLOR_LABELS[option]}
                  onClick={() => setColor(option)}
                  className={cn('size-6 rounded-full border-2', color === option ? 'border-foreground' : 'border-transparent')}
                  style={{backgroundColor: TAG_COLOR_HEX[option]}}
                />
              ))}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
