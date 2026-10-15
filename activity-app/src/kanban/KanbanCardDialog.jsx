import {useEffect, useId, useRef, useState} from 'react';
import {
  Archive,
  CalendarDays,
  ChevronDown,
  FileText,
  ListChecks,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Field, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';
import {Calendar} from '@/components/ui/calendar';
import {IconButton} from '@/components/ui/icon-button.jsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {OverlayScrollArea} from '@/components/ui/scroll-area';
import {MemberIdPicker} from '../planner/PlannerMemberPicker.jsx';
import {KANBAN_LIMITS, KANBAN_PRIORITIES, KANBAN_PRIORITY_LABELS, KANBAN_TAG_COLORS} from './kanban-shared.js';
import {KANBAN_DIALOG_CLASS, KANBAN_DIALOG_SCROLL_CLASS, AssigneeAvatar, TAG_COLOR_HEX, TAG_COLOR_LABELS, TagChip, discordChannelUrl, dueState, formatDueDate} from './kanban-ui.jsx';
import {newKanbanId} from './kanban-sync.js';

const NOTICE_ERRORS = {
  missing_permissions: 'Bardo no tiene permiso para enviar mensajes en este canal.',
  dm_closed: 'La persona tiene cerrados los mensajes directos.',
  rate_limited: 'Discord pidió esperar un momento.',
  discord_unavailable: 'Discord no respondió.',
  bot_not_configured: 'El bot de Bardo no está configurado.',
};

function noticeProblems(card) {
  const problems = [];
  const {channel, dm} = card.notifications || {};
  if (channel?.status === 'failed') problems.push(`No se pudo avisar en el canal. ${NOTICE_ERRORS[channel.errorCode] || 'Discord rechazó el mensaje.'}`);
  if (dm?.status === 'failed') problems.push(`No se pudo enviar el mensaje directo a la persona responsable. ${NOTICE_ERRORS[dm.errorCode] || 'Discord rechazó el mensaje.'}`);
  return problems;
}

function SectionLabel({icon: Icon, children, id}) {
  return (
    <span id={id} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" /> {children}
    </span>
  );
}

function TitleField({card, onCommit}) {
  const [draft, setDraft] = useState(card.title);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(card.title);
  }, [card.title, focused]);
  const commit = () => {
    const value = draft.trim().slice(0, KANBAN_LIMITS.title);
    if (!value) setDraft(card.title);
    else if (value !== card.title) onCommit(value);
  };
  return (
    <Textarea
      value={draft}
      rows={1}
      maxLength={KANBAN_LIMITS.title}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={event => setDraft(event.target.value.replace(/\n/g, ' '))}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape' && draft !== card.title) {
          event.stopPropagation();
          setDraft(card.title);
        }
      }}
      aria-label="Título de la tarea"
      className="kanban-title-input min-h-0 resize-none border-transparent bg-transparent px-1.5 py-1 text-base font-bold leading-snug shadow-none focus-visible:border-ring dark:bg-transparent"
    />
  );
}

function SubtaskList({card, onChange}) {
  const [text, setText] = useState('');
  const subtasks = card.subtasks || [];
  const done = subtasks.filter(item => item.done).length;
  const full = subtasks.length >= KANBAN_LIMITS.subtasks;
  const labelId = useId();
  const add = () => {
    const value = text.trim().slice(0, KANBAN_LIMITS.subtaskText);
    if (!value || full) return;
    onChange([...subtasks, {id: newKanbanId(), text: value, done: false}]);
    setText('');
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={labelId}>
      <div className="flex items-center justify-between">
        <SectionLabel id={labelId} icon={ListChecks}>Subtareas</SectionLabel>
        {subtasks.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{done} de {subtasks.length}</span>}
      </div>
      {subtasks.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {subtasks.map(item => (
            <li key={item.id} className="group/subtask flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent/60">
              <Checkbox
                checked={item.done}
                onCheckedChange={checked => onChange(subtasks.map(entry => (entry.id === item.id ? {...entry, done: Boolean(checked)} : entry)))}
                aria-label={item.text}
              />
              <span className={cn('flex-1 min-w-0 break-words text-[13px]', item.done && 'text-muted-foreground line-through')}>{item.text}</span>
              <IconButton
                label={`Quitar subtarea «${item.text}»`}
                size="icon-xs"
                className="opacity-60 group-hover/subtask:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(subtasks.filter(entry => entry.id !== item.id))}
              >
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={event => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          value={text}
          disabled={full}
          maxLength={KANBAN_LIMITS.subtaskText}
          onChange={event => setText(event.target.value)}
          placeholder={full ? `Máximo ${KANBAN_LIMITS.subtasks} subtareas` : 'Agregar subtarea'}
          aria-label="Nueva subtarea"
          className="h-8 text-[13px]"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-8 px-3 text-xs" disabled={!text.trim() || full}>Agregar</Button>
      </form>
    </div>
  );
}

function TagPicker({card, tags, onToggle, onCreateTag}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const selected = new Set(card.tagIds || []);
  const boardFull = tags.length >= KANBAN_LIMITS.tags;
  const create = () => {
    const value = name.trim().slice(0, KANBAN_LIMITS.tagName);
    if (!value || boardFull) return;
    const existing = tags.find(tag => tag.name.toLowerCase() === value.toLowerCase());
    if (existing) {
      if (!selected.has(existing.id)) onToggle(existing.id);
    } else {
      onCreateTag(value, color);
    }
    setName('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(card.tagIds || []).map(id => tags.find(tag => tag.id === id)).filter(Boolean).map(tag => (
        <TagChip key={tag.id} tag={tag} className="py-0.5 pr-0.5">
          <button
            type="button"
            onClick={() => onToggle(tag.id)}
            aria-label={`Quitar etiqueta ${tag.name}`}
            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </TagChip>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={(
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" aria-hidden="true" /> Etiqueta
            </Button>
          )}
        />
        <PopoverContent align="start" className="w-64 p-2">
          <div className="flex flex-col gap-1">
            {tags.length > 0 && (
              <ul className="flex flex-col gap-0.5" aria-label="Etiquetas del tablero">
                {tags.map(tag => (
                  <li key={tag.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-accent">
                      <Checkbox checked={selected.has(tag.id)} onCheckedChange={() => onToggle(tag.id)} />
                      <TagChip tag={tag} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-1 flex flex-col gap-2 border-t border-border/60 pt-2"
              onSubmit={event => {
                event.preventDefault();
                create();
              }}
            >
              <Input
                value={name}
                disabled={boardFull}
                maxLength={KANBAN_LIMITS.tagName}
                onChange={event => setName(event.target.value)}
                placeholder={boardFull ? `Máximo ${KANBAN_LIMITS.tags} etiquetas por tablero` : 'Nueva etiqueta'}
                aria-label="Nombre de la nueva etiqueta"
                className="h-8 text-xs"
              />
              {!boardFull && (
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Color de la etiqueta">
                  {KANBAN_TAG_COLORS.map(option => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={color === option}
                      aria-label={TAG_COLOR_LABELS[option]}
                      onClick={() => setColor(option)}
                      className={cn('size-6 rounded-full border-2 transition-transform', color === option ? 'border-foreground scale-110' : 'border-transparent')}
                      style={{backgroundColor: TAG_COLOR_HEX[option]}}
                    />
                  ))}
                </div>
              )}
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={!name.trim() || boardFull}>Crear y aplicar</Button>
            </form>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DocLinks({card, docs, onChange, onOpenDoc}) {
  const [open, setOpen] = useState(false);
  const docIds = card.docIds || [];
  const linked = docIds.map(id => ({id, doc: docs.find(doc => doc.id === id)}));
  const available = docs.filter(doc => !docIds.includes(doc.id) && !doc.archived && !doc.archivedAt);
  const full = docIds.length >= KANBAN_LIMITS.docs;
  return (
    <div className="flex flex-col gap-1.5">
      {linked.length > 0 && (
        <ul className="flex flex-col gap-1">
          {linked.map(({id, doc}) => (
            <li key={id} className="flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1">
              {doc ? (
                <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] font-medium hover:underline" onClick={() => onOpenDoc(id)}>
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{doc.title || 'Sin título'}</span>
                </button>
              ) : (
                <span className="flex-1 text-[13px] text-muted-foreground">Documento no disponible</span>
              )}
              <IconButton label={`Quitar enlace a ${doc?.title || 'documento'}`} size="icon-xs" onClick={() => onChange(docIds.filter(entry => entry !== id))}>
                <X className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={(
            <Button variant="ghost" size="sm" disabled={full} className="h-7 w-fit gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" aria-hidden="true" /> {full ? `Máximo ${KANBAN_LIMITS.docs} documentos` : 'Enlazar documento'}
            </Button>
          )}
        />
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Buscar documento del canal…" className="text-xs" />
            <CommandList className="max-h-60">
              <CommandEmpty>{docs.length ? 'Ningún documento coincide con la búsqueda.' : 'Este canal todavía no tiene documentos.'}</CommandEmpty>
              <CommandGroup>
                {available.map(doc => (
                  <CommandItem
                    key={doc.id}
                    value={`${doc.title || 'Sin título'} ${doc.id}`}
                    onSelect={() => {
                      onChange([...docIds, doc.id]);
                      setOpen(false);
                    }}
                    className="cursor-pointer text-xs"
                  >
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{doc.title || 'Sin título'}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ThreadSection({card, board, capabilities, remote, onOpenThread, busy}) {
  const url = discordChannelUrl(card, board);
  if (card.threadId) {
    return (
      <Button variant="secondary" size="sm" className="h-8 w-fit gap-1.5 text-xs" onClick={() => onOpenThread(card, url)}>
        <MessagesSquare className="size-3.5" aria-hidden="true" /> Ver hilo en Discord
      </Button>
    );
  }
  const reason = !remote
    ? 'Disponible al abrir Bardo en Discord.'
    : capabilities?.threadsSupported === false
      ? 'Los hilos solo se pueden crear en canales de texto, no en canales de voz.'
      : capabilities?.canCreateThreads === false && capabilities?.missingPermissions?.length
        ? `Bardo necesita estos permisos en el canal: ${capabilities.missingPermissions.join(', ')}. Pídeselos a quien administra el servidor.`
        : null;
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        className="h-8 w-fit gap-1.5 text-xs"
        disabled={Boolean(reason) || busy || card.threadPending || card.pending}
        onClick={() => onOpenThread(card)}
      >
        <MessagesSquare className="size-3.5" aria-hidden="true" /> {busy || card.threadPending ? 'Creando hilo…' : 'Crear hilo en Discord'}
      </Button>
      {reason && <p className="text-[11px] text-muted-foreground">{reason}</p>}
    </div>
  );
}

export function KanbanCardDialog({
  card,
  board,
  docs,
  capabilities,
  remote,
  today,
  onClose,
  onPatch,
  onMove,
  onArchive,
  onCreateTag,
  onOpenThread,
  onRetryNotice,
  onOpenDoc,
}) {
  const [threadBusy, setThreadBusy] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const columns = board?.columns || [];
  const tags = board?.tags || [];
  const column = columns.find(item => item.id === card.columnId);
  const doneId = columns.find(item => item.isDone)?.id || null;
  const problems = noticeProblems(card);
  const due = dueState(card, today, doneId);

  const patch = fields => onPatch(card.id, fields);

  const openThread = async (target, url) => {
    if (url) {
      onOpenThread(target, url);
      return;
    }
    setThreadBusy(true);
    try {
      await onOpenThread(target);
    } finally {
      setThreadBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) closeRef.current(); }}>
      <DialogContent
        scrollable={false}
        className={KANBAN_DIALOG_CLASS}
      >
        <OverlayScrollArea className={KANBAN_DIALOG_SCROLL_CLASS} contentClassName="grid grid-cols-[minmax(0,1fr)] gap-5 p-1 pr-3.5">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2 pr-8">
            <span className="text-xs font-medium tabular-nums text-muted-foreground">#{card.number}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <Button variant="secondary" size="sm" className="h-7 gap-1 px-2.5 text-xs" aria-label={`Columna: ${column?.name || 'sin columna'}. Cambiar`}>
                    {column?.name || 'Sin columna'} <ChevronDown className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              />
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">Mover a</DropdownMenuLabel>
                  {columns.map(item => (
                    <DropdownMenuItem key={item.id} disabled={item.id === card.columnId} onClick={() => onMove(card.id, item.id)} className="cursor-pointer">
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" aria-label={`Más acciones de la tarea #${card.number}`} className="rounded-full text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  )}
                />
                <DropdownMenuContent align="end" className="w-52">
                  {card.assignee && remote && problems.length > 0 && (
                    <>
                      <DropdownMenuItem onClick={() => onRetryNotice(card.id)} className="cursor-pointer">
                        <RotateCcw className="size-4 text-muted-foreground" /> Reenviar aviso
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={() => onArchive(card.id)} className="cursor-pointer">
                    <Archive className="size-4 text-muted-foreground" /> Archivar tarea
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
          <DialogTitle className="sr-only">Tarea #{card.number}: {card.title}</DialogTitle>
          <TitleField card={card} onCommit={title => patch({title})} />
        </DialogHeader>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel className="text-xs font-semibold text-muted-foreground"><UserRound className="size-3.5" aria-hidden="true" /> Responsable</FieldLabel>
            <MemberIdPicker
              value={card.assignee}
              onChange={assignee => patch({assignee})}
              renderTrigger={() => (
                <Button variant="outline" size="sm" className="h-8 w-full justify-start gap-2 px-2 text-xs font-medium" aria-label={card.assignee ? `Responsable: ${card.assignee.name}. Cambiar` : 'Elegir responsable'}>
                  {card.assignee ? <AssigneeAvatar assignee={card.assignee} className="size-5" /> : <UserRound className="size-3.5 text-muted-foreground" />}
                  <span className={cn('truncate', !card.assignee && 'text-muted-foreground')}>{card.assignee?.name || 'Sin responsable'}</span>
                </Button>
              )}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel className="text-xs font-semibold text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" /> Fecha límite</FieldLabel>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger
                render={(
                  <Button variant="outline" size="sm" className="h-8 w-full justify-start gap-2 px-2 text-xs font-medium" aria-label={card.dueDate ? `Fecha límite: ${formatDueDate(card.dueDate, today)}. Cambiar` : 'Elegir fecha límite'}>
                    <CalendarDays className={cn('size-3.5', due === 'overdue' ? 'text-destructive' : 'text-muted-foreground')} />
                    <span className={cn(!card.dueDate && 'text-muted-foreground', due === 'overdue' && 'text-destructive')}>
                      {card.dueDate ? `${due === 'overdue' ? 'Vencida · ' : ''}${formatDueDate(card.dueDate, today)}` : 'Sin fecha'}
                    </span>
                  </Button>
                )}
              />
              {/* Mismo patrón que Reuniones: el calendario trae su marco, "Quitar fecha" y "Hoy". */}
              <PopoverContent align="start" className="w-auto p-0 border-0 bg-transparent shadow-none ring-0">
                <Calendar
                  selected={card.dueDate || ''}
                  onSelect={iso => {
                    patch({dueDate: iso || null});
                    setDateOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
        </div>

        {problems.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-muted/50 px-3 py-2 text-xs text-muted-foreground" role="status">
            {problems.map(problem => <p key={problem}>{problem}</p>)}
            {remote && <Button variant="ghost" size="sm" className="h-7 w-fit px-2 text-xs" onClick={() => onRetryNotice(card.id)}>Reenviar aviso</Button>}
          </div>
        )}

        <Field className="gap-1.5">
          <FieldLabel className="text-xs font-semibold text-muted-foreground">Prioridad</FieldLabel>
          <ToggleGroup
            value={[card.priority || 'normal']}
            onValueChange={value => {
              const next = Array.isArray(value) ? value.at(-1) : value;
              if (next && next !== card.priority) patch({priority: next});
            }}
            variant="outline"
            size="sm"
            aria-label="Prioridad"
            className="flex-wrap"
          >
            {KANBAN_PRIORITIES.map(priority => (
              <ToggleGroupItem key={priority} value={priority} className="h-7 px-3 text-xs">
                {KANBAN_PRIORITY_LABELS[priority]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        <div className="flex flex-col gap-1.5">
          <SectionLabel icon={Tag}>Etiquetas</SectionLabel>
          <TagPicker
            card={card}
            tags={tags}
            onToggle={tagId => {
              const current = card.tagIds || [];
              patch({tagIds: current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]});
            }}
            onCreateTag={(name, color) => {
              const tagId = onCreateTag(name, color);
              if (tagId) patch({tagIds: [...(card.tagIds || []), tagId]});
            }}
          />
        </div>

        <Field className="gap-1.5">
          <FieldLabel htmlFor={`${descriptionId}-desc`} className="text-xs font-semibold text-muted-foreground">Descripción</FieldLabel>
          <Textarea
            id={`${descriptionId}-desc`}
            value={card.description || ''}
            maxLength={KANBAN_LIMITS.description}
            onChange={event => patch({description: event.target.value})}
            placeholder="Contexto, criterios de aceptación, enlaces…"
            className="min-h-20 text-[13px]"
          />
        </Field>

        <SubtaskList card={card} onChange={subtasks => patch({subtasks})} />

        <div className="flex flex-col gap-1.5">
          <SectionLabel icon={FileText}>Documentos</SectionLabel>
          <DocLinks card={card} docs={docs} onChange={docIds => patch({docIds})} onOpenDoc={onOpenDoc} />
        </div>

        <div className="flex flex-col gap-1.5">
          <SectionLabel icon={MessagesSquare}>Conversación</SectionLabel>
          <ThreadSection card={card} board={board} capabilities={capabilities} remote={remote} onOpenThread={openThread} busy={threadBusy} />
        </div>

        <DialogFooter className="items-center sm:justify-end">
          {card.pending && <p className="text-[11px] text-muted-foreground" role="status">Guardando…</p>}
          <Button onClick={onClose} className="h-9 px-5">Listo</Button>
        </DialogFooter>
        </OverlayScrollArea>
      </DialogContent>
    </Dialog>
  );
}
