import {useEffect, useRef, useState} from 'react';
import {Pencil, RotateCcw, Trash2} from 'lucide-react';
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
import {KANBAN_LIMITS} from './kanban-shared.js';
import {ColorPicker, ProjectChip, TagChip} from './kanban-ui.jsx';

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

const TAG_COPY = {
  title: 'Etiquetas del tablero',
  description: 'Borrar una etiqueta la quita de sus tareas.',
  empty: 'Todavía no hay etiquetas.',
  placeholder: 'Nueva etiqueta',
  full: `Máximo ${KANBAN_LIMITS.tags} etiquetas`,
  duplicate: 'Ya existe una etiqueta con ese nombre.',
  newName: 'Nombre de la nueva etiqueta',
  newColor: 'Color de la nueva etiqueta',
  color: name => `Color de la etiqueta ${name}`,
  rename: name => `Renombrar etiqueta ${name}`,
  remove: name => `Eliminar etiqueta ${name}`,
};

const PROJECT_COPY = {
  title: 'Proyectos del tablero',
  description: 'El proyecto dice a qué pertenece una tarea, y cada tarea tiene uno solo. Las etiquetas son para todo lo demás.',
  empty: 'Todavía no hay proyectos.',
  placeholder: 'Nuevo proyecto',
  full: `Máximo ${KANBAN_LIMITS.projects} proyectos`,
  duplicate: 'Ya existe un proyecto con ese nombre.',
  newName: 'Nombre del nuevo proyecto',
  newColor: 'Color del nuevo proyecto',
  color: name => `Color del proyecto ${name}`,
  rename: name => `Renombrar proyecto ${name}`,
  remove: name => `Eliminar proyecto ${name}`,
  confirmRemove: name => `¿Eliminar el proyecto «${name}»?`,
};

function LabelRow({item, items, copy, maxName, renderChip, removeNotice, onUpdate, onDelete}) {
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const rowRef = useRef(null);
  const restoreFocus = useRef(false);
  const restoreRemoveFocus = useRef(false);
  const editing = draft !== null;
  const value = (draft ?? '').trim();
  const duplicate = editing && items.some(other => other.id !== item.id && other.name.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    rowRef.current?.querySelector('[data-label-rename]')?.focus();
  }, [editing]);

  useEffect(() => {
    if (confirming || !restoreRemoveFocus.current) return;
    restoreRemoveFocus.current = false;
    rowRef.current?.querySelector('[data-label-remove]')?.focus();
  }, [confirming]);

  const commit = () => {
    if (value && !duplicate && value !== item.name) onUpdate(item.id, {name: value.slice(0, maxName)});
    setDraft(null);
  };

  // Se confirma en la misma fila: un segundo diálogo encima de este dejaba el
  // tablero oculto para lectores de pantalla si ambos se cerraban a la vez.
  if (confirming) {
    return (
      <li ref={rowRef} className="flex flex-col gap-2 rounded-xl border border-border/60 px-2.5 py-2">
        <p className="min-w-0 break-words text-xs">
          <span className="font-medium">{copy.confirmRemove(item.name)}</span> <span className="text-muted-foreground">{removeNotice(item)}</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button
            autoFocus
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              restoreRemoveFocus.current = true;
              setConfirming(false);
            }}
          >
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onDelete(item.id)}>Sí, eliminar</Button>
        </div>
      </li>
    );
  }

  return (
    <li ref={rowRef} className="flex flex-wrap items-center gap-x-1 rounded-xl border border-border/60 px-2.5 py-1.5 sm:flex-nowrap">
      {/* El nombre se parte en líneas y nunca empuja a los colores. En móvil los
          colores van en su propia línea, a todo el ancho de la fila. */}
      <div className="flex min-w-0 flex-1 items-center">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            maxLength={maxName}
            onChange={event => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                restoreFocus.current = true;
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                event.stopPropagation();
                restoreFocus.current = true;
                setDraft(null);
              }
            }}
            aria-label={copy.rename(item.name)}
            aria-invalid={duplicate || undefined}
            className="h-7 min-w-0 text-xs"
          />
        ) : renderChip(item)}
      </div>
      <ColorPicker
        compact
        value={item.color}
        onChange={color => onUpdate(item.id, {color})}
        label={copy.color(item.name)}
        className="order-last w-full sm:order-none sm:mx-1 sm:w-auto sm:shrink-0 sm:flex-nowrap"
      />
      <IconButton label={copy.rename(item.name)} size="icon-xs" data-label-rename="" onClick={() => setDraft(item.name)}>
        <Pencil className="size-3.5" />
      </IconButton>
      <IconButton label={copy.remove(item.name)} size="icon-xs" data-label-remove="" onClick={() => (removeNotice ? setConfirming(true) : onDelete(item.id))}>
        <Trash2 className="size-3.5" />
      </IconButton>
    </li>
  );
}

/** Lista de nombre + color del tablero: etiquetas y proyectos se administran igual. */
function LabelsDialog({open, items, copy, maxItems, maxName, renderChip, removeNotice, onAdd, onUpdate, onDelete, onClose}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const full = items.length >= maxItems;
  const value = name.trim();
  const duplicate = items.some(item => item.name.toLowerCase() === value.toLowerCase());
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {items.map(item => (
              <LabelRow
                key={item.id}
                item={item}
                items={items}
                copy={copy}
                maxName={maxName}
                renderChip={renderChip}
                removeNotice={removeNotice}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.empty}</p>
        )}
        <form
          className="flex flex-col gap-2"
          onSubmit={event => {
            event.preventDefault();
            if (!value || full || duplicate) return;
            onAdd(value.slice(0, maxName), color);
            setName('');
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              value={name}
              disabled={full}
              maxLength={maxName}
              onChange={event => setName(event.target.value)}
              placeholder={full ? copy.full : copy.placeholder}
              aria-label={copy.newName}
              aria-invalid={duplicate || undefined}
              className="h-9"
            />
            <Button type="submit" disabled={!value || full || duplicate}>Agregar</Button>
          </div>
          {duplicate && <p className="text-xs text-destructive">{copy.duplicate}</p>}
          {!full && <ColorPicker value={color} onChange={setColor} label={copy.newColor} />}
        </form>
      </DialogContent>
    </Dialog>
  );
}

const renderTagChip = tag => <TagChip tag={tag} wrap />;
const renderProjectChip = project => <ProjectChip project={project} wrap />;

export function TagsDialog({tags, ...props}) {
  return <LabelsDialog {...props} items={tags} copy={TAG_COPY} maxItems={KANBAN_LIMITS.tags} maxName={KANBAN_LIMITS.tagName} renderChip={renderTagChip} />;
}

export function ProjectsDialog({projects, cards, ...props}) {
  // Eliminar un proyecto no toca sus tareas, pero tampoco se puede deshacer.
  const removeNotice = project => {
    const count = Object.values(cards).filter(card => card.projectId === project.id).length;
    if (count === 0) return 'Ninguna tarea activa lo usa. No se puede deshacer.';
    return `${count === 1 ? 'Su tarea no se borra: quedará' : `Sus ${count} tareas no se borran: quedarán`} sin proyecto. No se puede deshacer.`;
  };
  return <LabelsDialog {...props} items={projects} copy={PROJECT_COPY} maxItems={KANBAN_LIMITS.projects} maxName={KANBAN_LIMITS.projectName} renderChip={renderProjectChip} removeNotice={removeNotice} />;
}
