import {useState, useEffect} from 'react';
import {
  Button,
  ProgressBar,
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
} from '@gravity-ui/icons';
import {
  clockToMinutes,
  minutesToClock,
} from './time-engine.js';
import {DEFAULT_DISCORD_MEMBERS} from './PlannerMemberPicker.jsx';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function getInitials(name = '') {
  const clean = name.replace(/^@/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

function getSessionStatus(state) {
  const blocks = state.blocks || [];
  const totalPoints = blocks.reduce((acc, b) => acc + (b.subpoints || []).length, 0);
  const completedPoints = blocks.reduce(
    (acc, b) => acc + (b.subpoints || []).filter((p) => p.status === 'done').length,
    0
  );
  if (state.liveActiveBlockId) return 'in_progress';
  if (totalPoints > 0 && completedPoints === totalPoints) return 'completed';
  if (completedPoints > 0) return 'in_progress';
  return 'upcoming';
}

export function PlannerSessionHeader({
  state,
  activeTab,
  onTabChange,
  onOpenEditor,
  onCopyAnnouncement,
  onNewCleanSession,
  onLoadDemo,
  onStartSession,
}) {
  const [isSticky, setIsSticky] = useState(false);

  const {
    title = 'Sesión sin título',
    date = '',
    startTime = '10:00',
    totalCalculatedDuration = 0,
    host = '',
    mentions = '',
    blocks = [],
  } = state;

  const totalPoints = blocks.reduce((acc, b) => acc + (b.subpoints || []).length, 0);
  const completedPoints = blocks.reduce(
    (acc, b) => acc + (b.subpoints || []).filter((p) => p.status === 'done').length,
    0
  );
  const progressPercent = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  const status = getSessionStatus(state);
  const formattedDate = formatSessionDate(date);
  const startM = clockToMinutes(startTime);
  const endTime = minutesToClock(startM + totalCalculatedDuration);
  const formattedDuration = formatHeaderDuration(totalCalculatedDuration);
  const participantsList = parseMentions(mentions);

  // Progressive sticky scroll detector
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 140) {
        setIsSticky(true);
      } else {
        setIsSticky(false);
      }
    };
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="flex flex-col gap-4 w-full max-w-4xl mx-auto pt-2 pb-4">
      {/* 1. Navegación contextual superior */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'editor' || activeTab === 'minutes') {
              onTabChange('agenda');
            }
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground font-medium transition-colors cursor-pointer select-none py-1 -ml-1 px-1 rounded-md"
        >
          <ChevronLeft width={13} height={13} />
          <span>Sesiones</span>
        </button>

        {/* Indicador de estado sutil en mobile */}
        <div className="sm:hidden">
          {status === 'in_progress' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              En curso
            </span>
          )}
          {status === 'upcoming' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-muted">
              Próxima
            </span>
          )}
          {status === 'completed' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-muted/90">
              <Check width={11} height={11} />
              Finalizada
            </span>
          )}
        </div>
      </div>

      {/* 2. Identidad de la sesión + Acciones principales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Título y Estado */}
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>

          <div className="hidden sm:inline-flex items-center">
            {status === 'in_progress' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                En curso
              </span>
            )}
            {status === 'upcoming' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-muted select-none">
                Próxima
              </span>
            )}
            {status === 'completed' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-muted/90 select-none">
                <Check width={11} height={11} />
                Finalizada
              </span>
            )}
          </div>
        </div>

        {/* Grupo de Acciones (Única CTA primaria + secundarias) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Acción secundaria: Copiar anuncio */}
          <Button
            variant="ghost"
            size="sm"
            onPress={onCopyAnnouncement}
            className="text-xs text-muted hover:text-foreground hidden sm:inline-flex"
          >
            <Copy width={13} height={13} />
            <span>Copiar anuncio</span>
          </Button>

          {/* Acción secundaria: Editar sesión */}
          <Button
            variant="ghost"
            size="sm"
            onPress={onOpenEditor}
            className="text-xs text-muted hover:text-foreground hidden md:inline-flex"
          >
            <Pencil width={13} height={13} />
            <span>Editar</span>
          </Button>

          {/* Menú overflow ... */}
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              aria-label="Más opciones de la sesión"
            >
              <EllipsisVertical width={14} height={14} />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === 'view-minutes') onTabChange('minutes');
                  if (key === 'edit') onOpenEditor();
                  if (key === 'copy-announcement') onCopyAnnouncement();
                  if (key === 'new-clean') onNewCleanSession();
                  if (key === 'load-demo') onLoadDemo();
                }}
              >
                <Dropdown.Item id="view-minutes" textValue="Ver acta y minuta">
                  <FileText />
                  <Label>Ver acta y minuta</Label>
                  <Description>Decisiones, tareas y acuerdos</Description>
                </Dropdown.Item>
                <Dropdown.Item id="edit" textValue="Editar estructura">
                  <Pencil />
                  <Label>Editar sesión</Label>
                  <Description>Configurar bloques y puntos</Description>
                </Dropdown.Item>
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

          {/* CTA Principal contextual según estado */}
          {status === 'upcoming' && (
            <Button
              variant="primary"
              size="sm"
              onPress={onStartSession}
              className="font-medium"
            >
              <Play width={13} height={13} />
              <span>Iniciar sesión</span>
            </Button>
          )}

          {status === 'in_progress' && (
            <Button
              variant="primary"
              size="sm"
              onPress={onStartSession}
              className="font-medium"
            >
              <Play width={13} height={13} />
              <span>Continuar sesión</span>
            </Button>
          )}

          {status === 'completed' && (
            <Button
              variant="primary"
              size="sm"
              onPress={() => onTabChange('minutes')}
              className="font-medium"
            >
              <FileText width={13} height={13} />
              <span>Ver minuta</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. Metadata compacta en una sola línea escaneable (estilo Notion/Calendly) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted font-normal pt-0.5">
        {formattedDate && <span>{formattedDate}</span>}
        {formattedDate && <span className="text-muted/40">·</span>}

        <span>{startTime}–{endTime}</span>
        <span className="text-muted/40">·</span>

        <span>{formattedDuration}</span>
        {host && <span className="text-muted/40">·</span>}

        {host && (
          <span className="text-foreground/90 font-medium">
            {host}
          </span>
        )}

        {participantsList.length > 0 && (
          <>
            <span className="text-muted/40">·</span>
            {/* Avatar Stack interactivo con Popover */}
            <Popover>
              <Popover.Trigger>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer select-none"
                  aria-label={`Ver ${participantsList.length} participantes convocados`}
                >
                  <div className="flex items-center -space-x-1.5">
                    {participantsList.slice(0, 3).map((tag, i) => {
                      const matched = DEFAULT_DISCORD_MEMBERS.find(
                        (m) => m.tag.toLowerCase() === tag.toLowerCase() || `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                      );
                      const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                      const initials = getInitials(matched?.globalName || tag);
                      return (
                        <div
                          key={i}
                          style={{backgroundColor: `${color}35`, color}}
                          className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-bold shadow-2xs"
                        >
                          {initials}
                        </div>
                      );
                    })}
                  </div>
                  {participantsList.length > 3 && (
                    <span className="text-[11px] font-medium text-muted">
                      +{participantsList.length - 3}
                    </span>
                  )}
                </button>
              </Popover.Trigger>
              <Popover.Content className="w-64 p-3 rounded-xl bg-surface border border-border shadow-xl">
                <Popover.Dialog>
                  <Popover.Heading className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border/40">
                    Convocados a la sesión ({participantsList.length})
                  </Popover.Heading>
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                    {participantsList.map((tag, i) => {
                      const matched = DEFAULT_DISCORD_MEMBERS.find(
                        (m) => m.tag.toLowerCase() === tag.toLowerCase() || `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                      );
                      const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                          <div
                            style={{backgroundColor: `${color}25`, color}}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                          >
                            {getInitials(matched?.globalName || tag)}
                          </div>
                          <span className="font-medium text-foreground truncate">
                            {matched?.globalName || tag}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </>
        )}
      </div>

      {/* 4. Progreso de la sesión operacional (discreto y sin KPI cards) */}
      <div className="flex items-center justify-between gap-3 pt-2 pb-1">
        <span className="text-xs font-medium text-foreground shrink-0">
          {completedPoints} de {totalPoints} puntos revisados
        </span>

        <ProgressBar
          aria-label="Progreso de temas revisados en la sesión"
          value={progressPercent}
          color="accent"
          size="sm"
          className="flex-1 max-w-sm"
        >
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>

        <span className="text-xs font-semibold text-muted shrink-0 tabular-nums">
          {progressPercent}%
        </span>
      </div>

      {/* 5. Progressive Sticky Header (Aparece únicamente al hacer scroll) */}
      {isSticky && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-md border-b border-border py-2.5 px-4 shadow-sm transition-all animate-in fade-in duration-200">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-bold text-foreground truncate">
                {title}
              </span>
              <span className="text-xs text-muted hidden sm:inline">·</span>
              <span className="text-xs text-muted/90 font-medium shrink-0 hidden sm:inline">
                {completedPoints}/{totalPoints} revisados ({progressPercent}%)
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {status === 'upcoming' && (
                <Button variant="primary" size="sm" onPress={onStartSession}>
                  <Play width={12} height={12} />
                  <span>Iniciar</span>
                </Button>
              )}
              {status === 'in_progress' && (
                <Button variant="primary" size="sm" onPress={onStartSession}>
                  <Play width={12} height={12} />
                  <span>Continuar</span>
                </Button>
              )}
              {status === 'completed' && (
                <Button variant="primary" size="sm" onPress={() => onTabChange('minutes')}>
                  <FileText width={12} height={12} />
                  <span>Minuta</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={onOpenEditor}
                aria-label="Editar sesión"
              >
                <Pencil width={13} height={13} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
