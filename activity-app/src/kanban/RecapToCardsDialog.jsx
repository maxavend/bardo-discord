// Acuerdos de una reunión → tareas del tablero, MD al responsable o descarte.
// Se puede repetir: cada acuerdo tiene un origen estable y nunca se duplica.
import {useEffect, useState} from 'react';
import {CalendarDays, ChevronDown, UserRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';
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
export function resolveOwner(owner, members = getAllDiscordEntities().members, ownerId = null) {
  const name = String(owner || '').trim().replace(/^@/, '').toLowerCase();
  if (!name) return null;
  if (ownerId && /^\d+$/.test(String(ownerId))) {
    const byId = members.find(member => String(member.id) === String(ownerId));
    return {id: String(ownerId), name: byId?.globalName || byId?.username || String(owner).replace(/^@/, '')};
  }
  const production = isProductionActivity();
  const match = members.find(member => !String(member.id || '').startsWith('custom-')
    && (!production || /^\d+$/.test(String(member.id || '')))
    && [member.globalName, member.username, member.tag?.replace(/^@/, '')].some(value => String(value || '').toLowerCase() === name));
  return match ? {id: String(match.id), name: match.globalName || match.username} : null;
}

const ACTION_LABELS = {task: 'Tarea', dm: 'MD', discard: 'Descartar'};
const TRIAGE_HINTS = {dm: 'Ya se envió por MD', discarded: 'Descartado'};
const DM_ERRORS = {
  dm_closed: 'tiene los MD cerrados',
  opted_out: 'pidió no recibir MD de Bardo',
  no_access: 'no tiene acceso a este canal',
};

/** MD con los acuerdos de cada responsable (una conversación por persona). */
async function sendAgreementDms(sessionId, items) {
  if (!isProductionActivity() || !window.__BARDO_SESSION_TOKEN__) {
    throw new Error('Para enviar MD, abre Bardo en Discord.');
  }
  const response = await fetch(`/api/planner/sessions/${encodeURIComponent(sessionId)}/agreements/dm`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${window.__BARDO_SESSION_TOKEN__}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({items}),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'No se pudieron enviar los MD. Inténtalo de nuevo.');
  return payload.results || [];
}

function plural(count, one, many) {
  return count === 1 ? one : many.replace('#', count);
}

/**
 * Cierre de los acuerdos: cada uno pasa a Tareas, se envía por MD a su
 * responsable o se descarta. El responsable llega elegido desde la reunión.
 * Se puede repetir: un acuerdo ya convertido nunca se duplica.
 */
export function RecapToCardsDialog({open, onClose, plannerState, sessionState, onOpenTasks, onTriage}) {
  const {view, loaded} = useKanbanSnapshot();
  const sessionId = plannerState?.id || plannerState?.eventId || null;
  // Foto al abrir (el diálogo se monta en cada apertura): guardar lo decidido
  // cambia la reunión y no debe reiniciar el diálogo antes de mostrar el resultado.
  const [agreements] = useState(() => collectMeetingAgreements(plannerState, sessionState));
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
    // Lo que ya se decidió antes queda sin acción; lo pendiente propone Tarea.
    setRows(agreements.map(agreement => ({
      agreement,
      sourceRef: agreementSourceRef(sessionId, agreement),
      action: agreement.triage ? null : 'task',
      assignee: resolveOwner(agreement.owner, undefined, agreement.ownerId),
    })));
    void ensureKanbanLoaded();
    getKanbanEngine().cardsFromSource(sessionId)
      .then(cards => {
        if (cancelled) return;
        const bySource = new Map(cards.map(card => [card.sourceRef, card]));
        setExisting(bySource);
        setRows(previous => previous.map(row => (bySource.has(row.sourceRef) ? {...row, action: null} : row)));
      })
      .catch(() => { if (!cancelled) setExisting(new Map()); });
    return () => { cancelled = true; };
  }, [open, agreements, sessionId]);

  const pending = rows.filter(row => !existing.has(row.sourceRef));
  const tasks = pending.filter(row => row.action === 'task');
  const dms = pending.filter(row => row.action === 'dm');
  const discards = pending.filter(row => row.action === 'discard');
  const missingDmOwner = dms.some(row => !row.assignee);
  const total = tasks.length + dms.length + discards.length;
  const title = plannerState?.title || 'Reunión';
  const updateRow = (index, patch) => setRows(previous => previous.map((item, i) => (i === index ? {...item, ...patch} : item)));

  const submitLabel = [
    tasks.length ? plural(tasks.length, 'Crear 1 tarea', 'Crear # tareas') : null,
    dms.length ? plural(dms.length, 'enviar 1 MD', 'enviar # MD') : null,
    discards.length ? plural(discards.length, 'descartar 1', 'descartar #') : null,
  ].filter(Boolean).join(' · ');

  const submit = async () => {
    if (!total || (tasks.length && !targetColumn) || missingDmOwner) return;
    setState({busy: true, error: null, done: null});
    const done = {created: 0, sent: 0, discarded: discards.length, failures: []};
    const triage = {};
    try {
      if (tasks.length) {
        const result = await getKanbanEngine().createFromAgreements({
          sessionId,
          sessionTitle: title,
          columnId: targetColumn.id,
          cards: tasks.map(row => {
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
        done.created = (result?.created || []).length;
        for (const row of tasks) if (row.agreement.id) triage[row.agreement.id] = 'task';
      }
      if (dms.length) {
        const results = await sendAgreementDms(sessionId, dms.map(row => ({
          assigneeId: row.assignee.id,
          content: row.agreement.content,
          origin: row.agreement.origin,
        })));
        const failed = new Map(results.filter(result => !result.ok).map(result => [String(result.assigneeId), result.code]));
        for (const row of dms) {
          if (failed.has(String(row.assignee.id))) continue;
          done.sent += 1;
          if (row.agreement.id) triage[row.agreement.id] = 'dm';
        }
        done.failures = [...failed.entries()].map(([id, code]) => {
          const name = dms.find(row => String(row.assignee.id) === id)?.assignee.name || 'Una persona';
          return `${name} ${DM_ERRORS[code] || 'no recibió el MD'}.`;
        });
      }
      for (const row of discards) if (row.agreement.id) triage[row.agreement.id] = 'discarded';
      if (Object.keys(triage).length) onTriage?.(triage);
      setState({busy: false, error: null, done});
    } catch (error) {
      if (Object.keys(triage).length) onTriage?.(triage);
      setState({busy: false, error: error?.message || 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.', done: null});
    }
  };

  const summary = state.done && [
    state.done.created ? plural(state.done.created, 'Se creó 1 tarea.', 'Se crearon # tareas.') : null,
    state.done.sent ? plural(state.done.sent, 'Se envió 1 acuerdo por MD.', 'Se enviaron # acuerdos por MD.') : null,
    state.done.discarded ? plural(state.done.discarded, 'Se descartó 1 acuerdo.', 'Se descartaron # acuerdos.') : null,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent scrollable={false} className={`${KANBAN_DIALOG_CLASS} sm:max-w-lg`}>
        <OverlayScrollArea className={KANBAN_DIALOG_SCROLL_CLASS} contentClassName="grid grid-cols-[minmax(0,1fr)] gap-5 p-1 pr-3.5">
        <DialogHeader>
          <DialogTitle>Revisar acuerdos</DialogTitle>
          <DialogDescription>Elige si cada acuerdo pasa a Tareas, se envía por MD a su responsable o se descarta.</DialogDescription>
        </DialogHeader>

        {state.done ? (
          <div className="flex flex-col gap-2" role="status">
            {(summary.length ? summary : ['No hubo cambios.']).map(line => <p key={line} className="text-sm text-foreground">{line}</p>)}
            {state.done.failures.map(line => <p key={line} className="text-sm text-destructive">{line}</p>)}
          </div>
        ) : !loaded ? (
          <p className="text-sm text-muted-foreground" role="status">Cargando tareas…</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5" aria-label="Acuerdos">
              {rows.map((row, index) => {
                const already = existing.get(row.sourceRef);
                const ownerHint = row.agreement.owner ? row.agreement.owner.replace(/^@/, '') : null;
                const previous = TRIAGE_HINTS[row.agreement.triage];
                return (
                  <li key={row.sourceRef} className={cn('flex flex-col gap-2 rounded-xl border px-3 py-2', already || (previous && !row.action) ? 'border-border/40' : 'border-border/70')}>
                    <span className="min-w-0">
                      <span className={cn('block text-[13px] font-medium leading-snug break-words', row.action === 'discard' && 'text-muted-foreground line-through')}>{row.agreement.content}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {already ? `Ya es la tarea #${already.number}` : previous ? `${previous} · ${row.agreement.origin}` : row.agreement.origin}
                      </span>
                    </span>
                    {!already && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ToggleGroup
                          value={row.action ? [row.action] : []}
                          onValueChange={value => updateRow(index, {action: (Array.isArray(value) ? value.at(-1) : value) || null})}
                          variant="outline"
                          size="sm"
                          spacing={0}
                          aria-label={`Qué hacer con «${row.agreement.content.slice(0, 60)}»`}
                        >
                          {Object.entries(ACTION_LABELS).map(([value, label]) => (
                            <ToggleGroupItem key={value} value={value} className="h-7 px-2.5 text-xs">{label}</ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        {row.action !== 'discard' && (
                          <MemberIdPicker
                            value={row.assignee}
                            onChange={assignee => updateRow(index, {assignee})}
                            renderTrigger={() => (
                              <Button variant="outline" size="sm" className={cn('h-7 gap-1.5 text-xs', row.assignee ? 'pl-px pr-2.5' : 'px-2')} aria-label={row.assignee ? `Responsable: ${row.assignee.name}. Cambiar` : 'Elegir responsable'}>
                                {row.assignee ? <AssigneeAvatar assignee={row.assignee} /> : <UserRound className="size-3.5 text-muted-foreground" />}
                                <span className={cn(!row.assignee && 'text-muted-foreground')}>{row.assignee?.name || 'Sin responsable'}</span>
                              </Button>
                            )}
                          />
                        )}
                        {row.action === 'dm' && !row.assignee && <span className="text-[11px] text-destructive">Elige a quién enviarlo</span>}
                        {row.action !== 'dm' && !row.assignee && ownerHint && <span className="text-[11px] text-muted-foreground">Responsable sugerido: {ownerHint}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {tasks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(
                      <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs" aria-label={`Tareas en ${targetColumn?.name || 'columna'}. Cambiar columna`}>
                        Tareas en {targetColumn?.name || 'columna'} <ChevronDown className="size-3.5" aria-hidden="true" />
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
            )}
            {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          </>
        )}

        <DialogFooter>
          {state.done ? (
            <>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
              {state.done.created > 0 && <Button onClick={onOpenTasks}>Ir a Tareas</Button>}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Decidir después</Button>
              <Button onClick={submit} disabled={!total || (tasks.length > 0 && !targetColumn) || missingDmOwner || state.busy}>
                {state.busy ? 'Aplicando…' : submitLabel ? submitLabel.charAt(0).toUpperCase() + submitLabel.slice(1) : 'Elige una acción'}
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
