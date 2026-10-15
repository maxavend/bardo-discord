// Acuerdos de una reunión → tareas del tablero del canal. Se puede repetir:
// cada acuerdo tiene un origen estable y nunca se duplica.
import {useEffect, useMemo, useState} from 'react';
import {CalendarDays, ChevronDown, UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Calendar} from '@/components/ui/calendar';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {cn} from '@/lib/utils';
import {OverlayScrollArea} from '@/components/ui/scroll-area';
import {collectMeetingAgreements, isProductionActivity} from '../planner/planner-store.js';
import {MemberIdPicker, getAllDiscordEntities} from '../planner/PlannerMemberPicker.jsx';
import {ensureKanbanLoaded, getKanbanEngine, useKanbanSnapshot} from './kanban-runtime.js';
import {defaultColumnId, todayIso} from './kanban-store.js';
import {KANBAN_LIMITS} from './kanban-shared.js';
import {KANBAN_DIALOG_CLASS, KANBAN_DIALOG_SCROLL_CLASS, AssigneeAvatar, formatDueDate} from './kanban-ui.jsx';

function stableHash(text) {
  let hash = 5381;
  for (const char of String(text)) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

export function agreementSourceRef(sessionId, agreement) {
  const key = agreement.id || stableHash(`${agreement.blockId || ''}|${agreement.content}`);
  return `planner:${sessionId}:${String(key).replace(/:/g, '_').slice(0, 120)}`;
}

/** Busca al dueño de un acuerdo ("@Pau", "Pau") entre las personas del servidor. */
export function resolveOwner(owner, members = getAllDiscordEntities().members) {
  const name = String(owner || '').trim().replace(/^@/, '').toLowerCase();
  if (!name) return null;
  const production = isProductionActivity();
  const match = members.find(member => !String(member.id || '').startsWith('custom-')
    && (!production || /^\d+$/.test(String(member.id || '')))
    && [member.globalName, member.username, member.tag?.replace(/^@/, '')].some(value => String(value || '').toLowerCase() === name));
  return match ? {id: String(match.id), name: match.globalName || match.username} : null;
}

export function RecapToCardsDialog({open, onClose, plannerState, sessionState, onOpenTasks}) {
  const {view, loaded} = useKanbanSnapshot();
  const sessionId = plannerState?.id || plannerState?.eventId || null;
  const agreements = useMemo(
    () => (open ? collectMeetingAgreements(plannerState, sessionState) : []),
    [open, plannerState, sessionState],
  );
  const [rows, setRows] = useState([]);
  const [existing, setExisting] = useState(new Map());
  const [columnId, setColumnId] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [state, setState] = useState({busy: false, error: null, done: null});
  const today = todayIso();
  const columns = (view.board?.columns || []).filter(column => !column.isDone);
  const targetColumn = columns.find(column => column.id === columnId) || columns.find(column => column.id === defaultColumnId(view.board));

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState({busy: false, error: null, done: null});
    setDueDate(null);
    setColumnId(null);
    setRows(agreements.map(agreement => ({
      agreement,
      sourceRef: agreementSourceRef(sessionId, agreement),
      selected: true,
      assignee: resolveOwner(agreement.owner),
    })));
    void ensureKanbanLoaded();
    getKanbanEngine().cardsFromSource(sessionId)
      .then(cards => {
        if (cancelled) return;
        const bySource = new Map(cards.map(card => [card.sourceRef, card]));
        setExisting(bySource);
        setRows(previous => previous.map(row => (bySource.has(row.sourceRef) ? {...row, selected: false} : row)));
      })
      .catch(() => { if (!cancelled) setExisting(new Map()); });
    return () => { cancelled = true; };
  }, [open, agreements, sessionId]);

  const selected = rows.filter(row => row.selected && !existing.has(row.sourceRef));
  const title = plannerState?.title || 'Reunión';

  const submit = async () => {
    if (!selected.length || !targetColumn) return;
    setState({busy: true, error: null, done: null});
    try {
      const result = await getKanbanEngine().createFromAgreements({
        sessionId,
        sessionTitle: title,
        columnId: targetColumn.id,
        cards: selected.map(row => {
          const unresolved = row.agreement.owner && !row.assignee ? `\nResponsable sugerido: ${row.agreement.owner.replace(/^@/, '')}` : '';
          return {
            sourceRef: row.sourceRef,
            title: row.agreement.content.slice(0, KANBAN_LIMITS.title),
            description: `Acuerdo de la reunión «${title}» (${row.agreement.origin}).${unresolved}`.slice(0, KANBAN_LIMITS.description),
            assignee: row.assignee,
            dueDate,
          };
        }),
      });
      setState({busy: false, error: null, done: (result?.created || []).length});
    } catch (error) {
      setState({busy: false, error: error?.message || 'No se pudieron crear las tareas.', done: null});
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent scrollable={false} className={`${KANBAN_DIALOG_CLASS} sm:max-w-lg`}>
        <OverlayScrollArea className={KANBAN_DIALOG_SCROLL_CLASS} contentClassName="grid gap-5 p-1">
        <DialogHeader>
          <DialogTitle>Crear tareas desde los acuerdos</DialogTitle>
          <DialogDescription>
            Cada acuerdo se convierte en una tarea del tablero de este canal. Quien la recibe recibe un aviso.
          </DialogDescription>
        </DialogHeader>

        {state.done !== null ? (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-sm text-foreground">
              {state.done === 0 ? 'Esos acuerdos ya eran tareas.' : state.done === 1 ? 'Se creó 1 tarea.' : `Se crearon ${state.done} tareas.`}
            </p>
          </div>
        ) : !loaded ? (
          <p className="text-sm text-muted-foreground" role="status">Cargando el tablero…</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5" aria-label="Acuerdos">
              {rows.map((row, index) => {
                const already = existing.get(row.sourceRef);
                const ownerHint = row.agreement.owner ? row.agreement.owner.replace(/^@/, '') : null;
                return (
                  <li key={row.sourceRef} className={cn('flex flex-col gap-2 rounded-xl border px-3 py-2', already ? 'border-border/40 opacity-70' : 'border-border/70')}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={Boolean(already) || row.selected}
                        disabled={Boolean(already)}
                        onCheckedChange={checked => setRows(previous => previous.map((item, i) => (i === index ? {...item, selected: Boolean(checked)} : item)))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug break-words">{row.agreement.content}</span>
                        <span className="block text-[11px] text-muted-foreground">{already ? `Ya es la tarea #${already.number}` : row.agreement.origin}</span>
                      </span>
                    </label>
                    {!already && (
                      <div className="flex flex-wrap items-center gap-2 pl-6.5">
                        <MemberIdPicker
                          value={row.assignee}
                          onChange={assignee => setRows(previous => previous.map((item, i) => (i === index ? {...item, assignee} : item)))}
                          renderTrigger={() => (
                            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-label={row.assignee ? `Responsable: ${row.assignee.name}. Cambiar` : 'Elegir responsable'}>
                              {row.assignee ? <AssigneeAvatar assignee={row.assignee} className="size-4" /> : <UserRound className="size-3.5 text-muted-foreground" />}
                              <span className={cn(!row.assignee && 'text-muted-foreground')}>{row.assignee?.name || 'Sin responsable'}</span>
                            </Button>
                          )}
                        />
                        {!row.assignee && ownerHint && <span className="text-[11px] text-muted-foreground">Sugerido: {ownerHint}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={(
                    <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs" aria-label={`Columna: ${targetColumn?.name || ''}. Cambiar`}>
                      En {targetColumn?.name || 'columna'} <ChevronDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  )}
                />
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuGroup>
                    {columns.map(column => (
                      <DropdownMenuItem key={column.id} onClick={() => setColumnId(column.id)} className="cursor-pointer">{column.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  render={(
                    <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs">
                      <CalendarDays className="size-3.5" aria-hidden="true" /> {dueDate ? `Vence ${formatDueDate(dueDate, today).toLowerCase()}` : 'Sin fecha límite'}
                    </Button>
                  )}
                />
                <PopoverContent align="start" className="w-auto p-0 border-0 bg-transparent shadow-none ring-0">
                  <Calendar
                    selected={dueDate || ''}
                    onSelect={iso => {
                      setDueDate(iso || null);
                      setDateOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          </>
        )}

        <DialogFooter>
          {state.done !== null ? (
            <>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
              <Button onClick={onOpenTasks}>Ir a Tareas</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={submit} disabled={!selected.length || !targetColumn || state.busy}>
                {state.busy ? 'Creando…' : selected.length === 1 ? 'Crear 1 tarea' : `Crear ${selected.length} tareas`}
              </Button>
            </>
          )}
        </DialogFooter>
        </OverlayScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default RecapToCardsDialog;
