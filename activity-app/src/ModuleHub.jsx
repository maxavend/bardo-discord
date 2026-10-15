// Hub de módulos: pestañas en el header (escritorio) y barra inferior (móvil).
// Un solo lugar, siempre el mismo, para moverse entre Inicio, Documentos,
// Reuniones y Tareas.
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {CalendarDaysIcon, Columns3Icon, FileTextIcon, HomeIcon} from '@/components/ui/animated-icons';
import {useIconAnimation} from '@/components/ui/animated-icons/use-icon-animation.js';

export const HUB_MODULES = [
  {id: 'home', label: 'Inicio', href: '#home', Icon: HomeIcon},
  {id: 'docs', label: 'Documentos', shortLabel: 'Docs', href: '#docs', Icon: FileTextIcon},
  {id: 'planner', label: 'Reuniones', href: '#planner', Icon: CalendarDaysIcon},
  {id: 'kanban', label: 'Tareas', href: '#kanban', Icon: Columns3Icon},
];

export function moduleForRoute(route) {
  if (route.type === 'home') return 'home';
  if (route.type === 'planner') return 'planner';
  if (route.type === 'kanban') return 'kanban';
  return 'docs';
}

/** La barra móvil solo aparece en la vista principal de cada módulo. */
export function routeShowsHubBar(route) {
  if (route.type === 'home' || route.type === 'library') return true;
  if (route.type === 'planner') return !route.tab || route.tab === 'home';
  if (route.type === 'kanban') return !route.cardId;
  return false;
}

function navigate(event, href, onNavigate) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onNavigate(href);
}

/**
 * Una pestaña del Hub. El ícono anima al pasar el cursor o con foco, y hace
 * una pasada completa cuando la pestaña queda activa.
 */
function HubLink({module, active, onNavigate, className, iconClassName, ariaLabel, children}) {
  const {iconRef, play, handlers} = useIconAnimation();
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) play();
    wasActive.current = active;
  }, [active, play]);
  const {Icon, href} = module;
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      onClick={event => navigate(event, href, onNavigate)}
      className={className}
      {...handlers}
    >
      <Icon ref={iconRef} className={iconClassName} aria-hidden="true" />
      {children}
    </a>
  );
}

/** Pestañas del header (≥ 768 px). Con el módulo activo, vuelve a su inicio. */
export function ModuleTabs({active, onNavigate}) {
  const navRef = useRef(null);
  // Fondo de la pestaña activa: se mide y se desliza (como la barra móvil).
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const place = () => {
      const tab = nav.querySelector('[aria-current="page"]');
      if (!tab || !tab.offsetWidth) {
        delete nav.dataset.ready;
        return;
      }
      nav.style.setProperty('--hub-tab-left', `${tab.offsetLeft}px`);
      nav.style.setProperty('--hub-tab-width', `${tab.offsetWidth}px`);
      nav.dataset.ready = '';
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(nav);
    return () => observer?.disconnect();
  }, [active]);

  return (
    <nav ref={navRef} aria-label="Módulos de Bardo" className="module-hub-tabs">
      <span className="module-hub-tabs-indicator" aria-hidden="true" />
      {HUB_MODULES.map(module => (
        <HubLink
          key={module.id}
          module={module}
          active={active === module.id}
          onNavigate={onNavigate}
          className="module-hub-tab"
          iconClassName="size-3.5"
        >
          <span>{module.label}</span>
        </HubLink>
      ))}
    </nav>
  );
}

// El teclado en pantalla achica el viewport visible: la barra se oculta para
// no tapar el campo que se está escribiendo.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setOpen(viewport.height < window.innerHeight * 0.75);
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return open;
}

// Como la barra nativa de iOS 26: al bajar se compacta (solo íconos) y al
// subir o volver arriba recupera los textos.
function useMinimizeOnScroll(enabled) {
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        if (y < 24) setMinimized(false);
        else if (delta > 12) setMinimized(true);
        else if (delta < -12) setMinimized(false);
        if (Math.abs(delta) > 12 || y < 24) last = y;
      });
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled]);
  return enabled && minimized;
}

/**
 * Barra inferior (< 768 px), al estilo de la tab bar nativa: cápsula flotante
 * de vidrio con un indicador que se desliza a la pestaña activa.
 */
export function ModuleBar({active, visible, onNavigate}) {
  const keyboardOpen = useKeyboardOpen();
  const shown = visible && !keyboardOpen;
  const minimized = useMinimizeOnScroll(shown);
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.hubBar = 'visible';
    else delete root.dataset.hubBar;
    return () => { delete root.dataset.hubBar; };
  }, [shown]);
  if (!shown) return null;
  const activeIndex = Math.max(0, HUB_MODULES.findIndex(module => module.id === active));
  return (
    <nav
      aria-label="Módulos de Bardo"
      className="module-hub-bar"
      data-minimized={minimized || undefined}
      style={{'--hub-index': activeIndex}}
    >
      <span className="module-hub-bar-indicator" aria-hidden="true" />
      {HUB_MODULES.map(module => (
        <HubLink
          key={module.id}
          module={module}
          active={active === module.id}
          onNavigate={onNavigate}
          ariaLabel={module.label}
          className="module-hub-bar-item"
          iconClassName="size-[22px]"
        >
          <span className="module-hub-bar-label" aria-hidden="true">{module.shortLabel || module.label}</span>
        </HubLink>
      ))}
    </nav>
  );
}
