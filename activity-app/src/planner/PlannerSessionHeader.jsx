import {
  Avatar,
  Button,
  Dropdown,
  Label,
  Description,
  Header,
} from '@heroui/react';
import {
  ChevronLeft,
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
import {DEFAULT_DISCORD_MEMBERS} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];
const COMMON_START_TIMES = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '17:45', '18:00', '19:00', '20:00'];

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
  activeTab,
  onTabChange,
  isEditing = false,
  onToggleEditMode,
  onUpdateHeaderField,
  onCopyAnnouncement,
  onNewCleanSession,
  onLoadDemo,
  onStartSession,
  onResumeSession,
  onInterruptSession,
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
  const estimatedEndTime = recalculateEstimatedEndTime(
    startTime,
    totalPlannedMinutes
  );

  const isRunning = sessionState?.status === SESSION_STATUS.RUNNING;
  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isCompleted = sessionState?.status === SESSION_STATUS.COMPLETED;
  const isInterrupted = sessionState?.status === SESSION_STATUS.INTERRUPTED;

  let formattedDate = date;
  try {
    const [year, month, day] = (date || '').split('-').map(Number);
    if (year && month && day) {
      const d = new Date(year, month - 1, day);
      const weekday = new Intl.DateTimeFormat('es-ES', {weekday: 'short'}).format(d);
      const monthName = new Intl.DateTimeFormat('es-ES', {month: 'short'}).format(d);
      formattedDate = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${monthName}`;
    }
  } catch {
    formattedDate = date;
  }

  const hours = Math.floor(totalPlannedMinutes / 60);
  const mins = totalPlannedMinutes % 60;
  const formattedDuration =
    hours > 0 ? (mins > 0 ? `${hours} h ${mins} min` : `${hours} h`) : `${mins} min`;

  const participantsList = parseMentions(mentions);

  const renderDateSelector = () => {
    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 px-2 py-1 -my-1 rounded-lg hover:bg-surface-secondary/70 transition-colors text-foreground text-xs font-normal cursor-pointer select-none border border-transparent hover:border-border/40"
          >
            <Calendar width={13} height={13} className="text-muted group-hover:text-foreground shrink-0 transition-colors" />
            <span className="font-medium text-foreground">{formattedDate || 'Seleccionar fecha'}</span>
            <Pencil width={11} height={11} className="text-muted/60 group-hover:text-foreground shrink-0 transition-colors ml-0.5" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-[240px]">
          <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('date', String(key))}>
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-muted px-2 py-1">Fecha de la sesión</Header>
              <Dropdown.Item id="2026-08-19" textValue="Mié 19 ago (Hoy)">
                <Calendar className="size-4 shrink-0 text-muted" />
                <div className="flex flex-col">
                  <Label>Hoy</Label>
                  <Description>Mié 19 ago 2026</Description>
                </div>
              </Dropdown.Item>
              <Dropdown.Item id="2026-08-20" textValue="Jue 20 ago (Mañana)">
                <Calendar className="size-4 shrink-0 text-muted" />
                <div className="flex flex-col">
                  <Label>Mañana</Label>
                  <Description>Jue 20 ago 2026</Description>
                </div>
              </Dropdown.Item>
              <Dropdown.Item id="2026-08-24" textValue="Próximo Lunes">
                <Calendar className="size-4 shrink-0 text-muted" />
                <div className="flex flex-col">
                  <Label>Próximo Lunes</Label>
                  <Description>Lun 24 ago 2026</Description>
                </div>
              </Dropdown.Item>
              <Dropdown.Item id="2026-08-26" textValue="Próximo Miércoles">
                <Calendar className="size-4 shrink-0 text-muted" />
                <div className="flex flex-col">
                  <Label>Próximo Miércoles</Label>
                  <Description>Mié 26 ago 2026</Description>
                </div>
              </Dropdown.Item>
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  };

  const renderTimeSelector = () => {
    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 px-2 py-1 -my-1 rounded-lg hover:bg-surface-secondary/70 transition-colors text-foreground text-xs font-normal cursor-pointer select-none border border-transparent hover:border-border/40"
          >
            <Clock width={13} height={13} className="text-muted group-hover:text-foreground shrink-0 transition-colors" />
            <span className="font-medium text-foreground">{startTime}–{estimatedEndTime}</span>
            <Pencil width={11} height={11} className="text-muted/60 group-hover:text-foreground shrink-0 transition-colors ml-0.5" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-[180px] max-h-64 overflow-y-auto">
          <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('startTime', String(key))}>
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-muted px-2 py-1">Hora de inicio</Header>
              {COMMON_START_TIMES.map((timeOption) => (
                <Dropdown.Item key={timeOption} id={timeOption} textValue={timeOption}>
                  <Clock className="size-4 shrink-0 text-muted" />
                  <Label>{timeOption}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    );
  };

  const renderHostSelector = () => {
    const hostMember = DEFAULT_DISCORD_MEMBERS.find(
      (m) =>
        m.globalName.toLowerCase() === (host || '').toLowerCase() ||
        m.tag.toLowerCase() === (host || '').toLowerCase() ||
        `@${m.globalName.toLowerCase()}` === (host || '').toLowerCase()
    );
    const hostColor = hostMember?.avatarColor || DISCORD_PALETTES[0];

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 px-2 py-1 -my-1 rounded-lg hover:bg-surface-secondary/70 transition-colors text-foreground text-xs font-normal cursor-pointer select-none border border-transparent hover:border-border/40"
          >
            <Avatar
              name={hostMember?.globalName || host || 'Conductor'}
              size="sm"
              className="w-5 h-5 text-[9.5px] font-bold shrink-0 border border-background shadow-2xs"
              style={{backgroundColor: `${hostColor}30`, color: hostColor}}
            />
            <span className="font-medium text-foreground">{host || 'Asignar conductor'}</span>
            <Pencil width={11} height={11} className="text-muted/60 group-hover:text-foreground shrink-0 transition-colors ml-0.5" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start" className="min-w-[240px]">
          <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('host', String(key))}>
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-muted px-2 py-1">Conduce la sesión</Header>
              {DEFAULT_DISCORD_MEMBERS.map((member) => (
                <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                  <Avatar
                    name={member.globalName}
                    size="xs"
                    className="w-5 h-5 text-[9px] font-bold shrink-0"
                    style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                  />
                  <div className="flex flex-col">
                    <Label>{member.globalName}</Label>
                    <Description>{member.tag}</Description>
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
    const selectedNames = new Set(
      participantsList.map((tag) => {
        const found = DEFAULT_DISCORD_MEMBERS.find(
          (m) =>
            m.tag.toLowerCase() === tag.toLowerCase() ||
            `@${m.globalName.toLowerCase()}` === tag.toLowerCase() ||
            m.globalName.toLowerCase() === tag.toLowerCase()
        );
        return found ? found.globalName : tag.replace(/^@/, '');
      })
    );

    return (
      <Dropdown>
        <Dropdown.Trigger>
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 px-2 py-1 -my-1 rounded-lg hover:bg-surface-secondary/70 transition-colors text-foreground text-xs font-normal cursor-pointer select-none border border-transparent hover:border-border/40"
            aria-label={`Editar ${participantsList.length} convocados`}
          >
            <div className="flex items-center -space-x-2">
              {participantsList.slice(0, 4).map((tag, i) => {
                const matched = DEFAULT_DISCORD_MEMBERS.find(
                  (m) =>
                    m.tag.toLowerCase() === tag.toLowerCase() ||
                    `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                );
                const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                return (
                  <Avatar
                    key={i}
                    name={matched?.globalName || tag}
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
            <Pencil width={11} height={11} className="text-muted/60 group-hover:text-foreground shrink-0 transition-colors ml-0.5" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end" className="min-w-[260px]">
          <Dropdown.Menu
            selectionMode="multiple"
            selectedKeys={selectedNames}
            onSelectionChange={(keys) => {
              const arr = Array.from(keys);
              onUpdateHeaderField?.('mentions', arr.map((k) => `@${k}`).join(' '));
            }}
          >
            <Dropdown.Section>
              <Header className="text-xs font-semibold text-muted px-2 py-1">Convocados a la sesión</Header>
              {DEFAULT_DISCORD_MEMBERS.map((member) => (
                <Dropdown.Item key={member.globalName} id={member.globalName} textValue={member.globalName}>
                  <Avatar
                    name={member.globalName}
                    size="xs"
                    className="w-5 h-5 text-[9px] font-bold shrink-0"
                    style={{backgroundColor: `${member.avatarColor}30`, color: member.avatarColor}}
                  />
                  <div className="flex flex-col">
                    <Label>{member.globalName}</Label>
                    <Description>{member.tag}</Description>
                  </div>
                  <Dropdown.ItemIndicator />
                </Dropdown.Item>
              ))}
            </Dropdown.Section>
          </Dropdown.Menu>
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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (isEditing && onToggleEditMode) onToggleEditMode();
                  else if (activeTab === 'minutes' || activeTab === 'recap') onTabChange('agenda');
                  else window.location.hash = '';
                }}
                aria-label="Volver"
                className="inline-flex items-center justify-center h-8 w-8 -ml-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary/70 transition-colors cursor-pointer shrink-0"
              >
                <ChevronLeft width={18} height={18} />
              </button>

              {isEditing ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onUpdateHeaderField?.('title', e.target.value)}
                  placeholder="Título de la sesión"
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground bg-transparent border-0 outline-none p-0 flex-1 min-w-0 focus:ring-0"
                />
              ) : (
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">{title}</h1>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                  <Play width={13} height={13} /> <span>Iniciar</span>
                </Button>
              ) : (isRunning || isPaused) ? (
                <Button variant="secondary" size="sm" onPress={() => onTabChange('minutes')} className="font-medium h-8 px-3">
                  <FileText width={13} height={13} /> <span>Acta</span>
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
                    <Button variant="ghost" size="sm" isIconOnly aria-label="Más opciones de la sesión" className="h-8 w-8 text-muted hover:text-foreground">
                      <EllipsisVertical width={14} height={14} />
                    </Button>
                  </Dropdown.Trigger>
                  <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu
                      onAction={(key) => {
                        if (key === 'view-minutes') onTabChange('minutes');
                        if (key === 'view-recap') onTabChange('recap');
                        if (key === 'edit') onToggleEditMode();
                        if (key === 'copy-announcement') onCopyAnnouncement();
                        if (key === 'new-clean') onNewCleanSession();
                        if (key === 'load-demo') onLoadDemo();
                        if (key === 'interrupt' && onInterruptSession) onInterruptSession();
                      }}
                    >
                      <Dropdown.Item id="view-minutes" textValue="Ver acta y acuerdos">
                        <FileText />
                        <Label>Ver acta y acuerdos</Label>
                        <Description>Decisiones y temas tratados</Description>
                      </Dropdown.Item>
                      {(isCompleted || isInterrupted) && (
                        <Dropdown.Item id="view-recap" textValue="Ver resumen (Session Recap)">
                          <ArrowRotateRight />
                          <Label>Ver resumen (Recap)</Label>
                          <Description>Métricas y grabaciones de la sesión</Description>
                        </Dropdown.Item>
                      )}
                      {(isRunning || isPaused) && (
                        <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                          <ArrowRotateLeft />
                          <Label>Interrumpir sesión</Label>
                          <Description>Pausar y conservar grabaciones</Description>
                        </Dropdown.Item>
                      )}
                      {!isEditing && (
                        <Dropdown.Item id="edit" textValue="Editar sesión integrada">
                          <Pencil />
                          <Label>Editar sesión</Label>
                          <Description>Modificar títulos, bloques y participantes</Description>
                        </Dropdown.Item>
                      )}
                      <Dropdown.Item id="copy-announcement" textValue="Copiar anuncio">
                        <Copy />
                        <Label>Copiar anuncio</Label>
                        <Description>Para compartir en canales de Discord</Description>
                      </Dropdown.Item>
                      <Dropdown.Item id="new-clean" textValue="Nueva sesión limpia">
                        <Plus />
                        <Label>Nueva sesión limpia</Label>
                        <Description>Empezar una agenda desde cero</Description>
                      </Dropdown.Item>
                      <Dropdown.Item id="load-demo" textValue="Cargar demo semanal">
                        <ArrowRotateLeft />
                        <Label>Cargar demo semanal</Label>
                        <Description>Ejemplo de diseño & producto</Description>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Fila 2: Descripción (gap de 8px / mt-2) */}
          {isEditing ? (
            <textarea
              rows={2}
              value={description}
              onChange={(e) => onUpdateHeaderField?.('description', e.target.value)}
              placeholder="Revisión de los avances de proyectos, feedback y acuerdos del equipo..."
              className="text-sm text-muted bg-transparent border-0 outline-none p-0 w-full resize-none leading-relaxed focus:ring-0 mt-2"
            />
          ) : description ? (
            <p className="text-sm text-muted leading-relaxed whitespace-pre-line mt-2">
              {description}
            </p>
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
