import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Columns3, FileText, Home } from 'lucide-react';
import { Tooltip, TooltipProvider } from '../ui/tooltip.jsx';

const NAV_ITEMS = [
  { key: 'home', label: 'Inicio', icon: Home },
  { key: 'documents', label: 'Documentos', icon: FileText },
  { key: 'boards', label: 'Tableros', icon: Columns3 },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
];

const MODE_TO_NAV = { home: 'home', document: 'documents', board: 'boards', event: 'agenda' };
const NAV_SECTIONS = { documents: 'documents', boards: 'boards', agenda: 'events' };
const NAV_TYPES = { documents: 'document', boards: 'board', agenda: 'event' };

function hrefFor(key, activeKey) {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const keyMap = { documents: 'document', boards: 'board', agenda: 'event' };
  if (key === 'home') {
    params.set('home', '1');
    ['document', 'board', 'event', 'task', 'custom_id'].forEach((name) => params.delete(name));
    return url.toString();
  }
  const parameter = keyMap[key];
  if (!parameter || !params.get(parameter)) return key === activeKey ? window.location.href : null;
  params.delete('home');
  ['document', 'board', 'event', 'custom_id'].forEach((name) => {
    if (name !== parameter) params.delete(name);
  });
  return url.toString();
}

export function AppChrome({ initialMode, avatarSrc }) {
  const [mode, setMode] = useState(initialMode);
  const activeKey = MODE_TO_NAV[mode] || 'documents';
  const links = useMemo(() => NAV_ITEMS.map((item) => ({ ...item, href: hrefFor(item.key, activeKey) })), [activeKey]);

  const openNavigationTarget = async (key) => {
    if (key === activeKey) return;
    if (!globalThis.__bardoNavigate) return;
    if (key === 'home') return globalThis.__bardoNavigate('home');

    const response = await fetch(`/api/home/${NAV_SECTIONS[key]}?limit=1`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No pudimos cargar ese espacio de Bardo.');
    const payload = await response.json();
    const item = Array.isArray(payload.items) ? payload.items[0] : null;
    if (!item?.id) {
      globalThis.__bardoToast?.error(key === 'boards' ? 'Todavía no hay tableros.' : key === 'agenda' ? 'Todavía no hay eventos.' : 'Todavía no hay documentos.');
      return;
    }
    return globalThis.__bardoNavigate(NAV_TYPES[key], item.id);
  };

  useEffect(() => {
    const observer = new MutationObserver(() => setMode(document.documentElement.dataset.bardoMode || initialMode));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bardo-mode'] });
    return () => observer.disconnect();
  }, [initialMode]);

  return (
    <TooltipProvider>
      <header className="bardo-app-chrome" aria-label="Bardo">
        <a className="bardo-app-brand" href={hrefFor('home', activeKey)} aria-label="Bardo · Ir al inicio">
          <span className="bardo-app-avatar"><img src={avatarSrc} alt="" width="32" height="32" /></span>
          <span className="bardo-app-brand-copy"><strong>Bardo</strong><span>En Discord</span></span>
        </a>

        <nav className="bardo-app-nav" aria-label="Navegación principal de Bardo">
          {links.map(({ key, label, href, icon: Icon }) => {
            const current = key === activeKey;
            const content = (
              <span className="bardo-app-nav-content">
                <Icon aria-hidden="true" size={17} strokeWidth={2.1} />
                <span className="bardo-app-nav-label">{label}</span>
              </span>
            );
            const item = (
              <button
                type="button"
                data-bardo-nav={key}
                aria-current={current ? 'page' : undefined}
                className="bardo-app-nav-item"
                onClick={() => { void openNavigationTarget(key).catch((error) => globalThis.__bardoToast?.error(error.message)); }}
              >{content}</button>
            );
            return <Tooltip key={key} label={label}>{item}</Tooltip>;
          })}
        </nav>
      </header>
    </TooltipProvider>
  );
}
