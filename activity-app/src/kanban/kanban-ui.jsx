// Piezas visuales pequeñas de Tareas, con los mismos tokens que Reuniones.
import {Folder} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {DISCORD_PALETTES, MemberAvatar, getAllDiscordEntities} from '../planner/PlannerMemberPicker.jsx';
import {KANBAN_PRIORITY_LABELS, KANBAN_TAG_COLORS} from './kanban-shared.js';

// Vive en kanban-shared.js (sin UI) para que Inicio la use sin cargar Tareas.
export {formatDueDate} from './kanban-shared.js';

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

/** `wrap` parte el nombre en varias líneas; sin él, se corta con «…» y el nombre completo queda en el title. */
function ChipName({name, wrap}) {
  return wrap
    ? <span className="min-w-0 break-words">{name}</span>
    : <span className="truncate" title={name}>{name}</span>;
}

export function TagChip({tag, wrap = false, className, children}) {
  if (!tag) return null;
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1 border border-border/70 px-1.5 py-px text-[10.5px] font-medium text-foreground', wrap ? 'rounded-xl' : 'rounded-full', className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{backgroundColor: TAG_COLOR_HEX[tag.color] || TAG_COLOR_HEX.gray}} />
      <ChipName name={tag.name} wrap={wrap} />
      {children}
    </span>
  );
}

/** El proyecto dice a qué pertenece la tarea; sin borde, para no confundirlo con una etiqueta. */
export function ProjectChip({project, wrap = false, className}) {
  if (!project) return null;
  const color = TAG_COLOR_HEX[project.color] || TAG_COLOR_HEX.gray;
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium text-muted-foreground', className)}>
      <Folder aria-hidden="true" className="size-3 shrink-0" style={{color}} fill="currentColor" />
      <span className="sr-only">Proyecto:</span>
      <ChipName name={project.name} wrap={wrap} />
    </span>
  );
}

/**
 * En móvil el círculo se ve de 16 px, pero el botón que lo envuelve mide 24 × 32:
 * se ve fino sin perder el área táctil. `compact` es la versión de escritorio
 * para filas angostas (16 px); si no, 24 px.
 */
export function ColorPicker({value, onChange, label, className, compact = false}) {
  return (
    <div className={cn('flex flex-wrap', compact ? 'sm:gap-0.5' : 'sm:gap-1.5', className)} role="radiogroup" aria-label={label}>
      {KANBAN_TAG_COLORS.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={TAG_COLOR_LABELS[option]}
          onClick={() => onChange(option)}
          className={cn('flex h-8 w-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring', compact ? 'sm:size-4' : 'sm:size-6')}
        >
          <span
            aria-hidden="true"
            className={cn('size-4 rounded-full border-2 transition-transform', !compact && 'sm:size-6', value === option ? 'border-foreground scale-110' : 'border-transparent')}
            style={{backgroundColor: TAG_COLOR_HEX[option]}}
          />
        </button>
      ))}
    </div>
  );
}

/** Primer color que nadie usa todavía, para no pedir una decisión al crear al vuelo. */
export function nextLabelColor(items = []) {
  const used = new Set(items.map(item => item.color));
  return KANBAN_TAG_COLORS.find(color => color !== 'gray' && !used.has(color)) || 'blue';
}

export function PriorityBadge({priority, className}) {
  if (priority !== 'high' && priority !== 'urgent') return null;
  return (
    <Badge variant={priority === 'urgent' ? 'destructive' : 'secondary'} className={cn('text-[10.5px] font-semibold', className)}>
      {KANBAN_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export {dueState, DueChip} from './kanban-due.jsx';

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
