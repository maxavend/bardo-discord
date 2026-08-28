import {useState, useEffect} from 'react';
import {
  Avatar,
  Button,
  Dropdown,
  Popover,
  Label,
  Description,
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
import {PlannerMemberPicker, DEFAULT_DISCORD_MEMBERS} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    const dayName = date.toLocaleDateString('es-ES', {weekday: 'short'});
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', '');
    const monthName = date.toLocaleDateString('es-ES', {month: 'short'}).replace('.', '');
    return `${capitalizedDay} ${d} ${monthName}`;
  } catch {
    return dateStr;
  }
}

function formatHeaderDuration(minutes = 0) {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours > 0 && rem === 0) return `${hours} h`;
  if (hours > 0) return `${hours} h ${rem} min`;
  return `${minutes} min`;
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
  const [isSticky, setIsSticky] = useState(false);

  const {
    title = 'Sesión sin título',
    description = '',
    date = '',
    startTime = '10:00',
    totalCalculatedDuration = 0,
    host = '',
    mentions = '',
  } = state;

  const isRunning = sessionState?.status === SESSION_STATUS.RUNNING;
  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isCompleted = sessionState?.status === SESSION_STATUS.COMPLETED;
  const isInterrupted = sessionState?.status === SESSION_STATUS.INTERRUPTED;

  const formattedDate = formatSessionDate(date);
  const estimatedEndTime = recalculateEstimatedEndTime(state, sessionState);
  const formattedDuration = formatHeaderDuration(totalCalculatedDuration);
  const participantsList = parseMentions(mentions);

  useEffect(() => {
    const handleScroll = () => setIsSticky(window.scrollY > 140);
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
              <Popover placement="bottom start">
                <Popover.Trigger>
                  <button
                    type="button"
                    disabled={!isEditing}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      isEditing ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
                    }`}
                  >
                    <Calendar width={13} height={13} className="text-muted/70 shrink-0" />
                    <span>{formattedDate || 'Seleccionar fecha'}</span>
                  </button>
                </Popover.Trigger>
                {isEditing && (
                  <Popover.Content className="p-3 rounded-xl bg-surface border border-border shadow-xl">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-semibold text-foreground">Fecha de la sesión</Label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => onUpdateHeaderField?.('date', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-field text-xs text-foreground border border-border outline-none focus:border-accent"
                      />
                    </div>
                  </Popover.Content>
                )}
              </Popover>

              <span className="text-muted/40">·</span>

              <Popover placement="bottom start">
                <Popover.Trigger>
                  <button
                    type="button"
                    disabled={!isEditing}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      isEditing ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
                    }`}
                  >
                    <Clock width={13} height={13} className="text-muted/70 shrink-0" />
                    <span>{startTime}–{estimatedEndTime}</span>
                  </button>
                </Popover.Trigger>
                {isEditing && (
                  <Popover.Content className="p-3 rounded-xl bg-surface border border-border shadow-xl">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-semibold text-foreground">Hora de inicio</Label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => onUpdateHeaderField?.('startTime', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-field text-xs text-foreground border border-border outline-none focus:border-accent"
                      />
                    </div>
                  </Popover.Content>
                )}
              </Popover>

              <span className="text-muted/40">·</span>

              <span>{formattedDuration}</span>
            </div>

            {/* Fila 4 Mobile: Quiénes (Host a la izquierda, Participantes a la derecha) */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted font-normal pt-0.5">
              {host ? (() => {
                const hostMember = DEFAULT_DISCORD_MEMBERS.find(
                  (m) =>
                    m.globalName.toLowerCase() === host.toLowerCase() ||
                    m.tag.toLowerCase() === host.toLowerCase() ||
                    `@${m.globalName.toLowerCase()}` === host.toLowerCase()
                );
                const hostColor = hostMember?.avatarColor || DISCORD_PALETTES[0];

                if (isEditing) {
                  return (
                    <Dropdown>
                      <Dropdown.Trigger>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Avatar
                            name={hostMember?.globalName || host}
                            size="sm"
                            className="w-7 h-7 text-[10.5px] font-bold shrink-0 border border-background shadow-2xs"
                            style={{backgroundColor: `${hostColor}30`, color: hostColor}}
                          />
                          <span className="text-foreground/90 font-medium">{host}</span>
                        </button>
                      </Dropdown.Trigger>
                      <Dropdown.Popover placement="bottom start">
                        <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('host', String(key))}>
                          {DEFAULT_DISCORD_MEMBERS.map((member) => (
                            <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                              <Label>{member.globalName}</Label>
                              <Description>{member.tag}</Description>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  );
                }

                return (
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      name={hostMember?.globalName || host}
                      size="sm"
                      className="w-7 h-7 text-[10.5px] font-bold shrink-0 border border-background shadow-2xs"
                      style={{backgroundColor: `${hostColor}30`, color: hostColor}}
                    />
                    <span className="text-foreground/90 font-medium">{host}</span>
                  </div>
                );
              })() : <div />}

              <Popover placement="bottom end">
                <Popover.Trigger>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer select-none"
                    aria-label={`Ver ${participantsList.length} participantes convocados`}
                  >
                    <div className="flex items-center -space-x-2">
                      {participantsList.slice(0, 4).map((tag, i) => {
                        const matched = DEFAULT_DISCORD_MEMBERS.find(
                          (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                        );
                        const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                        return (
                          <Avatar
                            key={i}
                            name={matched?.globalName || tag}
                            size="sm"
                            className="w-7 h-7 border-2 border-background text-[10.5px] font-bold shadow-2xs shrink-0"
                            style={{backgroundColor: `${color}35`, color}}
                          />
                        );
                      })}
                    </div>
                    {participantsList.length > 4 && <span className="text-xs font-semibold text-muted ml-0.5">+{participantsList.length - 4}</span>}
                  </button>
                </Popover.Trigger>
                <Popover.Content placement="bottom end" className="w-80 p-3 rounded-xl bg-surface border border-border shadow-xl">
                  <Popover.Dialog>
                    <Popover.Heading className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border/40">
                      Convocados a la sesión ({participantsList.length})
                    </Popover.Heading>
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <PlannerMemberPicker
                          value={mentions}
                          onChange={(val) => onUpdateHeaderField?.('mentions', val)}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {participantsList.map((tag, i) => {
                          const matched = DEFAULT_DISCORD_MEMBERS.find(
                            (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                          );
                          const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                              <Avatar
                                name={matched?.globalName || tag}
                                size="xs"
                                className="w-5 h-5 border border-background text-[9px] font-bold shadow-2xs shrink-0"
                                style={{backgroundColor: `${color}35`, color}}
                              />
                              <span className="text-foreground">{matched?.globalName || tag}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          </div>

          {/* Versión DESKTOP: Estructura compacta y alineada horizontalmente */}
          <div className="hidden sm:flex sm:items-center sm:justify-between sm:gap-4 sm:mt-4 text-xs text-muted font-normal">
            {/* Banda temporal izquierda */}
            <div className="flex items-center gap-2 flex-wrap">
              <Popover placement="bottom start">
                <Popover.Trigger>
                  <button
                    type="button"
                    disabled={!isEditing}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      isEditing ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
                    }`}
                  >
                    <Calendar width={13} height={13} className="text-muted/70 shrink-0" />
                    <span>{formattedDate || 'Seleccionar fecha'}</span>
                  </button>
                </Popover.Trigger>
                {isEditing && (
                  <Popover.Content className="p-3 rounded-xl bg-surface border border-border shadow-xl">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-semibold text-foreground">Fecha de la sesión</Label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => onUpdateHeaderField?.('date', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-field text-xs text-foreground border border-border outline-none focus:border-accent"
                      />
                    </div>
                  </Popover.Content>
                )}
              </Popover>

              <span className="text-muted/40">·</span>

              <Popover placement="bottom start">
                <Popover.Trigger>
                  <button
                    type="button"
                    disabled={!isEditing}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      isEditing ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
                    }`}
                  >
                    <Clock width={13} height={13} className="text-muted/70 shrink-0" />
                    <span>{startTime}–{estimatedEndTime}</span>
                  </button>
                </Popover.Trigger>
                {isEditing && (
                  <Popover.Content className="p-3 rounded-xl bg-surface border border-border shadow-xl">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs font-semibold text-foreground">Hora de inicio</Label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => onUpdateHeaderField?.('startTime', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-field text-xs text-foreground border border-border outline-none focus:border-accent"
                      />
                    </div>
                  </Popover.Content>
                )}
              </Popover>

              <span className="text-muted/40">·</span>

              <span>{formattedDuration}</span>
            </div>

            {/* Banda de personas derecha: Entidad unificada [Paula Molina · ◉◉◉ +3] */}
            <div className="flex items-center gap-2.5 shrink-0">
              {host && (() => {
                const hostMember = DEFAULT_DISCORD_MEMBERS.find(
                  (m) =>
                    m.globalName.toLowerCase() === host.toLowerCase() ||
                    m.tag.toLowerCase() === host.toLowerCase() ||
                    `@${m.globalName.toLowerCase()}` === host.toLowerCase()
                );
                const hostColor = hostMember?.avatarColor || DISCORD_PALETTES[0];

                if (isEditing) {
                  return (
                    <Dropdown>
                      <Dropdown.Trigger>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Avatar
                            name={hostMember?.globalName || host}
                            size="sm"
                            className="w-7 h-7 text-[10.5px] font-bold shrink-0 border border-background shadow-2xs"
                            style={{backgroundColor: `${hostColor}30`, color: hostColor}}
                          />
                          <span className="text-foreground/90 font-medium">{host}</span>
                        </button>
                      </Dropdown.Trigger>
                      <Dropdown.Popover placement="bottom start">
                        <Dropdown.Menu onAction={(key) => onUpdateHeaderField?.('host', String(key))}>
                          {DEFAULT_DISCORD_MEMBERS.map((member) => (
                            <Dropdown.Item key={member.id} id={member.globalName} textValue={member.globalName}>
                              <Label>{member.globalName}</Label>
                              <Description>{member.tag}</Description>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  );
                }

                return (
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      name={hostMember?.globalName || host}
                      size="sm"
                      className="w-7 h-7 text-[10.5px] font-bold shrink-0 border border-background shadow-2xs"
                      style={{backgroundColor: `${hostColor}30`, color: hostColor}}
                    />
                    <span className="text-foreground/90 font-medium">{host}</span>
                  </div>
                );
              })()}

              {host && participantsList.length > 0 && <span className="text-muted/40">·</span>}

              <Popover placement="bottom end">
                <Popover.Trigger>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer select-none"
                    aria-label={`Ver ${participantsList.length} participantes convocados`}
                  >
                    <div className="flex items-center -space-x-2">
                      {participantsList.slice(0, 4).map((tag, i) => {
                        const matched = DEFAULT_DISCORD_MEMBERS.find(
                          (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                        );
                        const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                        return (
                          <Avatar
                            key={i}
                            name={matched?.globalName || tag}
                            size="sm"
                            className="w-7 h-7 border-2 border-background text-[10.5px] font-bold shadow-2xs shrink-0"
                            style={{backgroundColor: `${color}35`, color}}
                          />
                        );
                      })}
                    </div>
                    {participantsList.length > 4 && <span className="text-xs font-semibold text-muted ml-0.5">+{participantsList.length - 4}</span>}
                  </button>
                </Popover.Trigger>
                <Popover.Content placement="bottom end" className="w-80 p-3 rounded-xl bg-surface border border-border shadow-xl">
                  <Popover.Dialog>
                    <Popover.Heading className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border/40">
                      Convocados a la sesión ({participantsList.length})
                    </Popover.Heading>
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <PlannerMemberPicker
                          value={mentions}
                          onChange={(val) => onUpdateHeaderField?.('mentions', val)}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {participantsList.map((tag, i) => {
                          const matched = DEFAULT_DISCORD_MEMBERS.find(
                            (member) => member.tag.toLowerCase() === tag.toLowerCase() || `@${member.globalName.toLowerCase()}` === tag.toLowerCase()
                          );
                          const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                              <Avatar
                                name={matched?.globalName || tag}
                                size="xs"
                                className="w-5 h-5 border border-background text-[9px] font-bold shadow-2xs shrink-0"
                                style={{backgroundColor: `${color}35`, color}}
                              />
                              <span className="text-foreground">{matched?.globalName || tag}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {isSticky && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b border-border py-2.5 px-4 shadow-sm transition-all animate-in fade-in duration-200">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold text-foreground truncate">{title}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isRunning && !isPaused && !isCompleted && (
                <Button variant="primary" size="sm" onPress={onStartSession}>
                  <Play width={12} height={12} /> <span>Iniciar</span>
                </Button>
              )}
              {isCompleted && (
                <Button variant="primary" size="sm" onPress={() => onTabChange('recap')}>
                  <FileText width={12} height={12} /> <span>Resumen</span>
                </Button>
              )}
              {onToggleEditMode && (
                <Button variant="ghost" size="sm" isIconOnly onPress={onToggleEditMode} aria-label="Editar sesión">
                  <Pencil width={13} height={13} />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
