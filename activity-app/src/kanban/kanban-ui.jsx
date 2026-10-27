// Piezas visuales pequeñas de Tareas, con los mismos tokens que Reuniones.
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {DISCORD_PALETTES, MemberAvatar, getAllDiscordEntities} from '../planner/PlannerMemberPicker.jsx';
import {KANBAN_PRIORITY_LABELS} from './kanban-shared.js';

import {SHEET_DIALOG_CLASS, SHEET_DIALOG_SCROLL_CLASS} from '@/components/sheet-dialog.js';

export const KANBAN_DIALOG_CLASS = `kanban-card-dialog sm:max-w-xl ${SHEET_DIALOG_CLASS}`;
export const KANBAN_DIALOG_SCROLL_CLASS = SHEET_DIALOG_SCROLL_CLASS;

export const TAG_COLOR_HEX = {
  gray: '#949BA4',
  blue: '#5865F2',
  green: '#57F287',
  yellow: '#FEE75C',
  orange: '#E67E22',
  red: '#ED4245',
  purple: '#9B59B6',
  pink: '#EB459E',
};

export const TAG_COLOR_LABELS = {
  gray: 'Gris', blue: 'Azul', green: 'Verde', yellow: 'Amarillo',
  orange: 'Naranja', red: 'Rojo', purple: 'Morado', pink: 'Rosado',
};

function hashColor(seed = '') {
  const total = [...String(seed)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DISCORD_PALETTES[total % DISCORD_PALETTES.length];
}

export function memberAvatarUrl(id) {
  if (!id) return null;
  return getAllDiscordEntities().members.find(member => String(member.id) === String(id))?.avatar || null;
}

export function AssigneeAvatar({assignee, className}) {
  if (!assignee) return null;
  const member = {globalName: assignee.name || '?', avatar: memberAvatarUrl(assignee.id), avatarColor: hashColor(assignee.id)};
  return <MemberAvatar name={member.globalName} member={member} size="md" className={className} />;
}

export function TagChip({tag, className, children}) {
  if (!tag) return null;
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 px-1.5 py-px text-[10.5px] font-medium text-foreground', className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{backgroundColor: TAG_COLOR_HEX[tag.color] || TAG_COLOR_HEX.gray}} />
      <span className="truncate">{tag.name}</span>
      {children}
    </span>
  );
}

export function PriorityBadge({priority, className}) {
  if (priority !== 'high' && priority !== 'urgent') return null;
  return (
    <Badge variant={priority === 'urgent' ? 'destructive' : 'secondary'} className={cn('text-[10.5px] font-semibold', className)}>
      {KANBAN_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatDueDate(dueDate, today) {
  if (!dueDate) return '';
  if (dueDate === today) return 'Hoy';
  if (dueDate === addDays(today, 1)) return 'Mañana';
  if (dueDate === addDays(today, -1)) return 'Ayer';
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const sameYear = year === Number(today.slice(0, 4));
  return new Intl.DateTimeFormat('es-CL', {day: 'numeric', month: 'short', ...(sameYear ? {} : {year: 'numeric'})}).format(date);
}

export function dueState(card, today, doneId) {
  if (!card.dueDate || card.columnId === doneId) return 'neutral';
  if (card.dueDate < today) return 'overdue';
  if (card.dueDate === today) return 'today';
  return 'neutral';
}

export function DueChip({card, today, doneId, className}) {
  if (!card.dueDate) return null;
  const state = dueState(card, today, doneId);
  const label = formatDueDate(card.dueDate, today);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        state === 'overdue' ? 'text-destructive' : state === 'today' ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
      title={state === 'overdue' ? `Vencida: ${label}` : `Vence: ${label}`}
    >
      <span className="sr-only">{state === 'overdue' ? 'Vencida, ' : 'Vence '}</span>
      {label}
    </span>
  );
}

export function subtaskProgress(card) {
  const total = card.subtasks?.length || 0;
  const done = card.subtasks?.filter(item => item.done).length || 0;
  return {total, done};
}

export function discordChannelUrl(card, board) {
  const guildId = board?.guildId || (typeof window !== 'undefined' && window.__BARDO_GUILD_ID__);
  if (!card?.threadId || !guildId) return null;
  return `https://discord.com/channels/${guildId}/${card.threadId}`;
}
