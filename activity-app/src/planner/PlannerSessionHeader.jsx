import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label, Description, Header } from '@/components/ui/label';
import {
  FileText,
  Pencil,
  Copy,
  Plus,
  ArrowRotateLeft,
  EllipsisVertical,
  Play,
  Check,
  ArrowRotateRight,
  Calendar,
  Clock,
} from '@gravity-ui/icons';
import {
  SESSION_STATUS,
  recalculateEstimatedEndTime,
} from './session-runner.js';
import {
  getAllDiscordEntities,
  SearchableParticipantMenu,
} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function PlannerSessionHeader({
  state,
  sessionState,
  _activeTab,
  onTabChange,
  isEditing = false,
  onToggleEditMode,
  onUpdateHeaderField,
  onCopyAnnouncement,
  onNewCleanSession,
  _onLoadDemo,
  onStartSession,
  onResumeSession,
  onInterruptSession,
  onGoHome: _onGoHome,
}) {
  const {
    title = 'Sesión sin título',
    description = '',
    date = '',
    startTime = '17:45',
    blocks = [],
    totalCalculatedDuration = 0,
    host = '',
    mentions = '',
  } = state || {};

  const totalPlannedMinutes = (blocks || []).reduce(
    (accumulator, b) => accumulator + (b.durationMinutes || 0),
    0
  ) || totalCalculatedDuration || 0;
  const _estimatedEndTime = recalculateEstimatedEndTime(
    startTime,
    totalPlannedMinutes
  );

  const isRunning = sessionState?.status === SESSION_STATUS.RUNNING;
  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isCompleted = sessionState?.status === SESSION_STATUS.COMPLETED;
  const isInterrupted = sessionState?.status === SESSION_STATUS.INTERRUPTED;

  let _formattedDate = date;
  try {
    const [year, month, day] = (date || '').split('-').map(Number);
    if (year && month && day) {
      const d = new Date(year, month - 1, day);
      const weekday = new Intl.DateTimeFormat('es-ES', {weekday: 'short'}).format(d);
      const monthName = new Intl.DateTimeFormat('es-ES', {month: 'short'}).format(d);
      _formattedDate = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${monthName}`;
    }
  } catch {
    _formattedDate = date;
  }

  const hours = Math.floor(totalPlannedMinutes / 60);
  const mins = totalPlannedMinutes % 60;
  const formattedDuration =
    hours > 0 ? (mins > 0 ? `${hours} h ${mins} min` : `${hours} h`) : `${mins} min`;

  const participantsList = parseMentions(mentions);

  const renderDateSelector = () => {
    if (!isEditing) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium bg-muted/60 px-2.5 py-1 rounded-full border border-border/50">
          <Calendar width={13} height={13} className="shrink-0 text-primary" />
          <span>{_formattedDate || 'Sin fecha'}</span>
        </span>
      );
    }
    return (
      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar width={13} height={13} className="shrink-0" />
        <Input
          type="date"
          value={date || ''}
          onChange={(e) => onUpdateHeaderField?.('date', e.target.value)}
          className="h-7 w-32 px-2 text-xs rounded-lg"
        />
      </div>
    );
  };

  const renderTimeSelector = () => {
    if (!isEditing) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium bg-muted/60 px-2.5 py-1 rounded-full border border-border/50">
          <Clock width={13} height={13} className="shrink-0 text-primary" />
          <span>{startTime || '10:00'}</span>
        </span>
      );
    }
    return (
      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock width={13} height={13} className="shrink-0" />
        <Input
          type="time"
          value={startTime || '10:00'}
          onChange={(e) => onUpdateHeaderField?.('startTime', e.target.value)}
          className="h-7 w-24 px-2 text-xs rounded-lg"
        />
      </div>
    );
  };

  const renderHostSelector = () => {
    const {members} = getAllDiscordEntities();
    const hostMember = members.find(
      (m) =>
        m.globalName.toLowerCase() === (host || '').toLowerCase() ||
        m.tag.toLowerCase() === (host || '').toLowerCase() ||
        `@${m.globalName.toLowerCase()}` === (host || '').toLowerCase()
    );
    const hostColor = hostMember?.avatarColor || DISCORD_PALETTES[0];

    if (!isEditing) {
      return (
        <div className="flex items-center gap-1.5">
          <Avatar
            name={hostMember?.globalName || host || 'Conductor'}
            size="sm"
            className="w-5 h-5 text-[9.5px] font-bold shrink-0 border border-background shadow-2xs"
            style={{backgroundColor: `${hostColor}30`, color: hostColor}}
          />
          <span className="font-medium text-foreground">{host || 'Conductor'}</span>
        </div>
      );
    }

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 cursor-pointer text-xs font-normal text-muted hover:text-foreground transition-colors p-0 bg-transparent border-0 outline-none"
          >
            <Avatar
              name={hostMember?.globalName || host || 'Conductor'}
              size="sm"
              className="w-5 h-5 text-[9.5px] font-bold shrink-0 border border-background shadow-2xs"
              style={{backgroundColor: `${hostColor}30`, color: hostColor}}
            />
            <span className="font-medium text-foreground underline decoration-dotted underline-offset-4 decoration-muted-foreground/60 group-hover:decoration-foreground transition-colors">
              {host || 'Asignar conductor'}
            </span>
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-[260px] max-h-72 overflow-y-auto p-1.5 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl">
          <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('host', String(key))} className="p-0">
            <Dropdown.Section>
              <Header className="text-[10px] font-bold text-muted/70 px-3 pt-2 pb-1.5 uppercase tracking-wider">
                Conduce la sesión
              </Header>
              {members.map((member) => (
                <Dropdown.Item key={member.id || member.tag} id={member.globalName} textValue={member.globalName} className="px-3 py-1.5 rounded-xl text-xs">
                  <Avatar
                    name={member.globalName}
                    size="sm"
                    className="w-5 h-5 text-[9px] font-bold shrink-0 shadow-2xs"
                    style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                  />
                  <div className="flex flex-col min-w-0">
                    <Label className="text-xs font-medium text-foreground leading-tight">{member.globalName}</Label>
                    <Description className="text-[10.5px] text-muted leading-tight">{member.tag}</Description>
                  </div>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  };

  const renderParticipantsPicker = () => {
    const {members, roles} = getAllDiscordEntities();

    const selectedKeys = new Set(
      participantsList.map((tag) => {
        const found = [...members, ...roles].find(
          (m) =>
            m.tag.toLowerCase() === tag.toLowerCase() ||
            `@${(m.globalName || m.name || '').toLowerCase()}` === tag.toLowerCase() ||
            (m.globalName || m.name || '').toLowerCase() === tag.toLowerCase()
        );
        return found ? found.tag : tag;
      })
    );

    if (!isEditing) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center -space-x-2">
            {participantsList.slice(0, 4).map((tag, i) => {
              const matchedMember = members.find(
                (m) =>
                  m.tag.toLowerCase() === tag.toLowerCase() ||
                  `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
              );
              const matchedRole = roles.find(
                (r) =>
                  r.tag.toLowerCase() === tag.toLowerCase() ||
                  `@${r.name.toLowerCase()}` === tag.toLowerCase()
              );
              const color = matchedMember?.avatarColor || matchedRole?.color || DISCORD_PALETTES[i % DISCORD_PALETTES.length];

              if (matchedRole) {
                return (
                  <span
                    key={i}
                    className="w-5 h-5 rounded-md border-2 border-background text-[9px] font-bold flex items-center justify-center text-white shadow-2xs shrink-0"
                    style={{backgroundColor: color}}
                  >
                    #
                  </span>
                );
              }

              return (
                <Avatar
                  key={i}
                  name={matchedMember?.globalName || tag}
                  size="sm"
                  className="w-5 h-5 border-2 border-background text-[9px] font-bold shadow-2xs shrink-0"
                  style={{backgroundColor: `${color}35`, color}}
                />
              );
            })}
          </div>
          {participantsList.length > 4 && (
            <span className="text-xs font-semibold text-muted">
              +{participantsList.length - 4}
            </span>
          )}
        </div>
      );
    }

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 cursor-pointer text-xs font-normal text-muted hover:text-foreground transition-colors p-0 bg-transparent border-0 outline-none"
            aria-label={`Editar ${participantsList.length} convocados`}
          >
            <div className="flex items-center -space-x-2">
              {participantsList.slice(0, 4).map((tag, i) => {
                const matchedMember = members.find(
                  (m) =>
                    m.tag.toLowerCase() === tag.toLowerCase() ||
                    `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                );
                const matchedRole = roles.find(
                  (r) =>
                    r.tag.toLowerCase() === tag.toLowerCase() ||
                    `@${r.name.toLowerCase()}` === tag.toLowerCase()
                );
                const color = matchedMember?.avatarColor || matchedRole?.color || DISCORD_PALETTES[i % DISCORD_PALETTES.length];

                if (matchedRole) {
                  return (
                    <span
                      key={i}
                      className="w-5 h-5 rounded-md border-2 border-background text-[9px] font-bold flex items-center justify-center text-white shadow-2xs shrink-0"
                      style={{backgroundColor: color}}
                    >
                      #
                    </span>
                  );
                }

                return (
                  <Avatar
                    key={i}
                    name={matchedMember?.globalName || tag}
                    size="sm"
                    className="w-5 h-5 border-2 border-background text-[9px] font-bold shadow-2xs shrink-0"
                    style={{backgroundColor: `${color}35`, color}}
                  />
                );
              })}
            </div>
            {participantsList.length > 4 && (
              <span className="text-xs font-semibold text-muted">
                +{participantsList.length - 4}
              </span>
            )}
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end" className="p-0 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
          <SearchableParticipantMenu
            selectedKeys={selectedKeys}
            onSelectionChange={(newKeys) => {
              onUpdateHeaderField?.('mentions', newKeys.join(' '));
            }}
          />
        </Dropdown.Popover>
      </Dropdown>
    );
  };

  return (
    <header className="w-full max-w-4xl mx-auto px-4 py-5 sm:px-0 sm:py-3 animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)] gap-2.5 sm:gap-4 items-start">
        <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />

        <div className="flex flex-col min-w-0 w-full pb-2">
          {/* Fila 1: Título y Acción Principal */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <textarea
                  rows={1}
                  value={title}
                  onChange={(e) => onUpdateHeaderField?.('title', e.target.value)}
                  placeholder="Nombre de la reunión"
                  className="doc-title doc-title-input"
                  aria-label="Nombre de la reunión"
                />
              ) : (
                <h1 className="doc-title">{title || 'Reunión sin título'}</h1>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 pt-1">
              {!isEditing && !isRunning && !isPaused && (
                <Button variant="ghost" size="sm" onPress={onCopyAnnouncement} className="text-xs text-muted hover:text-foreground hidden sm:inline-flex h-8 px-2.5 font-medium">
                  <Copy width={13} height={13} /> <span>Copiar anuncio</span>
                </Button>
              )}

              {isEditing ? (
                <Button variant="primary" size="sm" onPress={onToggleEditMode} className="font-medium h-8 px-3.5">
                  <Check width={14} height={14} /> <span>Listo</span>
                </Button>
              ) : isInterrupted && onResumeSession ? (
                <Button variant="primary" size="sm" onPress={onResumeSession} className="font-medium h-8 px-3.5">
                  <Play width={13} height={13} /> <span>Reanudar</span>
                </Button>
              ) : !isRunning && !isPaused && !isCompleted && !isInterrupted ? (
                <Button variant="primary" size="sm" onPress={onStartSession} className="font-medium h-8 px-3.5">
                  <Play width={13} height={13} /> <span>Iniciar reunión</span>
                </Button>
              ) : isCompleted ? (
                <Button variant="primary" size="sm" onPress={() => onTabChange('recap')} className="font-medium h-8 px-3.5">
                  <FileText width={13} height={13} /> <span>Ver resumen</span>
                </Button>
              ) : null}

              {/* Menú ⋮ (visible solo en desktop, en mobile se mantiene limpio) */}
              <div className="hidden sm:inline-flex">
                <Dropdown>
                  <Dropdown.Trigger>
                    <Button variant="ghost" size="sm" isIconOnly aria-label="Más opciones de la reunión" className="h-8 w-8 text-muted hover:text-foreground">
                      <EllipsisVertical width={14} height={14} />
                    </Button>
                  </Dropdown.Trigger>
                  <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                      onAction={(key) => {
                        if (key === 'view-recap') onTabChange('recap');
                        if (key === 'edit') onToggleEditMode();
                        if (key === 'copy-announcement') onCopyAnnouncement();
                        if (key === 'new-clean') onNewCleanSession();
                        if (key === 'interrupt' && onInterruptSession) onInterruptSession();
                      }}
                    >
                      {(isCompleted || isInterrupted) && (
                        <Dropdown.Item id="view-recap" textValue="Ver resumen de la reunión">
                          <ArrowRotateRight />
                          <Label>Ver resumen</Label>
                          <Description>Métricas y grabaciones de la reunión</Description>
                        </Dropdown.Item>
                      )}
                      {(isRunning || isPaused) && (
                        <Dropdown.Item id="interrupt" textValue="Pausar reunión" className="text-danger">
                          <ArrowRotateLeft />
                          <Label className="text-danger">Pausar reunión</Label>
                          <Description>Pausar y conservar avance</Description>
                        </Dropdown.Item>
                      )}
                      {!isEditing && (
                        <Dropdown.Item id="edit" textValue="Editar reunión">
                          <Pencil />
                          <Label>Editar reunión</Label>
                          <Description>Modificar nombre, agenda y participantes</Description>
                        </Dropdown.Item>
                      )}
                      <Dropdown.Item id="copy-announcement" textValue="Copiar anuncio">
                        <Copy />
                        <Label>Copiar anuncio</Label>
                        <Description>Para compartir en canales de Discord</Description>
                      </Dropdown.Item>
                      <Dropdown.Item id="new-clean" textValue="Nueva reunión">
                        <Plus />
                        <Label>Nueva reunión</Label>
                        <Description>Empezar una agenda desde cero</Description>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Fila 2: Descripción con estilos idénticos a Docs */}
          {isEditing ? (
            <textarea
              rows={1}
              value={description}
              onChange={(e) => onUpdateHeaderField?.('description', e.target.value)}
              placeholder="Agrega un objetivo o descripción..."
              className="doc-description doc-description-input"
              aria-label="Objetivo o descripción de la reunión"
            />
          ) : description ? (
            <p className="doc-description">{description}</p>
          ) : null}

          {/* Versión MOBILE: Separación conceptual de 'Cuándo' y 'Quiénes' */}
          <div className="flex flex-col gap-3 mt-4 sm:hidden">
            {/* Fila 3 Mobile: Cuándo (Fecha · Hora · Duración) */}
            <div className="flex items-center gap-2 text-xs text-muted font-normal flex-wrap">
              {renderDateSelector()}
              <span className="text-muted/40">·</span>
              {renderTimeSelector()}
              <span className="text-muted/40">·</span>
              <span>{formattedDuration}</span>
            </div>

            {/* Fila 4 Mobile: Quiénes (Host a la izquierda, Participantes a la derecha) */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted font-normal pt-0.5">
              {renderHostSelector()}
              {renderParticipantsPicker()}
            </div>
          </div>

          {/* Versión DESKTOP: Estructura compacta y alineada horizontalmente */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4 sm:mt-4 text-xs text-muted font-normal">
            {/* Banda temporal izquierda */}
            <div className="flex items-center gap-2 flex-wrap">
              {renderDateSelector()}
              <span className="text-muted/40">·</span>
              {renderTimeSelector()}
              <span className="text-muted/40">·</span>
              <span>{formattedDuration}</span>
            </div>

            {/* Banda de personas derecha: Entidad unificada [Paula Molina · ◉◉◉ +3] */}
            <div className="flex items-center gap-2.5 shrink-0">
              {renderHostSelector()}
              {participantsList.length > 0 && <span className="text-muted/40">·</span>}
              {renderParticipantsPicker()}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
