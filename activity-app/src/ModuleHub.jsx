// Hub de módulos: pestañas en el header (escritorio) y barra inferior (móvil).
// Un solo lugar, siempre el mismo, para moverse entre Inicio, Documentos,
// Reuniones y Tareas.
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {CalendarDaysIcon, Columns3Icon, FileTextIcon, HomeIcon} from '@/components/ui/animated-icons';
import {useIconAnimation} from '@/components/ui/animated-icons/use-icon-animation.js';
import {lensFilter, surfaceFilter} from './hub-lens.js';

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
      draggable={false}
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

// Arrastrar más de esto (px) desliza el lente en vez de pulsar la pestaña.
const DRAG_THRESHOLD = 6;

function placeIndicator(nav, tab, left = tab.offsetLeft) {
  nav.style.setProperty('--hub-tab-left', `${left}px`);
  nav.style.setProperty('--hub-tab-width', `${tab.offsetWidth}px`);
  for (const other of nav.querySelectorAll('[data-hub-target]')) {
    if (other !== tab) delete other.dataset.hubTarget;
  }
  tab.dataset.hubTarget = '';
}

function nearestTab(tabs, clientX) {
  let nearest = null;
  let best = Infinity;
  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect();
    const distance = Math.abs(clientX - (rect.left + rect.width / 2));
    if (distance < best) {
      best = distance;
      nearest = tab;
    }
  }
  return nearest;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Lente de vidrio de las barras del Hub, como la tab bar de iOS 26: al
 * presionar, el fondo de la pestaña se levanta, crece y refracta lo que tiene
 * debajo; deslizándolo se recorren las pestañas, y al soltar se asienta en la
 * elegida. `liftedSize(tab, nav)` da el tamaño del lente levantado.
 */
function useHubLens({active, enabled = true, tabSelector, liftedSize, onNavigate}) {
  const navRef = useRef(null);
  const gesture = useRef(null);
  const settleTimer = useRef(0);
  const swallowClick = useRef(false);

  const placeOnActive = () => {
    const nav = navRef.current;
    if (!nav || gesture.current) return;
    const tab = nav.querySelector(`${tabSelector}[aria-current="page"]`);
    if (!tab || !tab.offsetWidth) {
      delete nav.dataset.ready;
      return;
    }
    placeIndicator(nav, tab);
    nav.dataset.ready = '';
  };

  // Fondo de la pestaña activa: se mide y se desliza.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return undefined;
    placeOnActive();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(placeOnActive) : null;
    observer?.observe(nav);
    return () => observer?.disconnect();
  }, [active, enabled]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const aimLens = (nav, tab) => {
    const [width, height] = liftedSize(tab, nav);
    const refraction = lensFilter(width, height);
    if (refraction) {
      nav.style.setProperty('--hub-lens-filter', refraction);
      nav.dataset.refracting = '';
    }
  };

  const land = (nav, tab) => {
    gesture.current = null;
    delete nav.dataset.lifted;
    delete nav.dataset.dragging;
    if (tab) placeIndicator(nav, tab);
    // La navegación llega por hashchange: si al rato la pestaña activa no es
    // la del lente (clic con modificador, gesto cancelado), vuelve a ella.
    clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      delete nav.dataset.refracting;
      placeOnActive();
    }, 360);
  };

  const onPointerDown = event => {
    const nav = navRef.current;
    const tab = event.target.closest?.(tabSelector);
    if (!nav || !tab || event.button !== 0 || !event.isPrimary || prefersReducedMotion()) return;
    clearTimeout(settleTimer.current);
    gesture.current = {pointerId: event.pointerId, startX: event.clientX, dragging: false, tab};
    nav.style.setProperty('--hub-x', `${event.clientX - nav.getBoundingClientRect().left}px`);
    placeIndicator(nav, tab);
    aimLens(nav, tab);
    nav.dataset.lifted = '';
  };

  const onPointerMove = event => {
    const nav = navRef.current;
    const current = gesture.current;
    if (!nav || !current || current.pointerId !== event.pointerId) return;
    if (!current.dragging) {
      if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD) return;
      current.dragging = true;
      nav.dataset.dragging = '';
      try {
        nav.setPointerCapture(event.pointerId);
      } catch {
        // Sin captura el arrastre sigue funcionando mientras el puntero esté encima.
      }
    }
    const tabs = [...nav.querySelectorAll(tabSelector)];
    const tab = nearestTab(tabs, event.clientX);
    if (!tab) return;
    if (tab !== current.tab) aimLens(nav, tab);
    current.tab = tab;
    // El lente sigue al dedo sin salirse de la primera ni la última pestaña.
    const x = event.clientX - nav.getBoundingClientRect().left;
    const first = tabs[0];
    const last = tabs[tabs.length - 1];
    const left = Math.min(Math.max(x - tab.offsetWidth / 2, first.offsetLeft), last.offsetLeft + last.offsetWidth - tab.offsetWidth);
    nav.style.setProperty('--hub-x', `${x}px`);
    placeIndicator(nav, tab, left);
  };

  const onPointerUp = event => {
    const nav = navRef.current;
    const current = gesture.current;
    if (!nav || !current || current.pointerId !== event.pointerId) return;
    land(nav, current.tab);
    if (!current.dragging) return;
    // Soltar tras deslizar elige la pestaña; el clic que sigue no cuenta.
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 0);
    if (current.tab.getAttribute('aria-current') !== 'page') onNavigate(current.tab.getAttribute('href'));
  };

  const onPointerCancel = event => {
    const nav = navRef.current;
    if (!nav || gesture.current?.pointerId !== event.pointerId) return;
    land(nav, nav.querySelector(`${tabSelector}[aria-current="page"]`));
  };

  const onClickCapture = event => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    navRef,
    lensHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
      // Arrastrar un link abriría el arrastre nativo y cancelaría el gesto.
      onDragStart: event => event.preventDefault(),
    },
  };
}

// Lo que el lente de las pestañas crece al levantarse, a cada lado.
const TABS_LENS_GROW_X = 10;
const TABS_LENS_LIFTED_HEIGHT = 44;
const tabsLensSize = tab => [tab.offsetWidth + TABS_LENS_GROW_X * 2, TABS_LENS_LIFTED_HEIGHT];

/** Pestañas del header (≥ 768 px). Con el módulo activo, vuelve a su inicio. */
export function ModuleTabs({active, onNavigate}) {
  const {navRef, lensHandlers} = useHubLens({active, tabSelector: '.module-hub-tab', liftedSize: tabsLensSize, onNavigate});
  return (
    <nav ref={navRef} aria-label="Módulos de Bardo" className="module-hub-tabs" {...lensHandlers}>
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

// El lente de la barra crece 8 px a cada lado y 3 px arriba y abajo de la cápsula.
const barLensSize = (tab, nav) => [tab.offsetWidth + 16, nav.clientHeight + 6];

// Vidrio de la cápsula: su filtro de refracción sigue el tamaño de la barra,
// que cambia al compactarse.
function useGlassSurface(ref, enabled) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return undefined;
    const apply = () => {
      const filter = surfaceFilter(node.offsetWidth, node.offsetHeight);
      if (!filter) return;
      node.style.setProperty('--hub-glass-filter', filter);
      node.dataset.glass = '';
    };
    apply();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [ref, enabled]);
}

/**
 * Barra inferior (< 768 px), al estilo de la tab bar nativa: cápsula flotante
 * de vidrio líquido, cuyo borde refracta lo que pasa por debajo, con el mismo
 * lente deslizable que las pestañas del header.
 */
export function ModuleBar({active, visible, onNavigate}) {
  const keyboardOpen = useKeyboardOpen();
  const shown = visible && !keyboardOpen;
  const minimized = useMinimizeOnScroll(shown);
  const {navRef, lensHandlers} = useHubLens({active, enabled: shown, tabSelector: '.module-hub-bar-item', liftedSize: barLensSize, onNavigate});
  useGlassSurface(navRef, shown);
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
      ref={navRef}
      aria-label="Módulos de Bardo"
      className="module-hub-bar"
      data-minimized={minimized || undefined}
      style={{'--hub-index': activeIndex}}
      {...lensHandlers}
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
