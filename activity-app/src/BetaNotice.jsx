import {useEffect, useRef, useState} from 'react';
import {Xmark} from '@gravity-ui/icons';
import {IconButton} from '@/components/ui/icon-button.jsx';

const DISMISSED_KEY = 'bardo.beta-notice.dismissed.v1';

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Aviso de beta bajo el header. Se cierra una vez y no vuelve en este
 * dispositivo. Publica su alto en --bardo-notice-height para que las vistas
 * de alto fijo (Tareas) no generen scroll.
 */
export function BetaNotice() {
  const [hidden, setHidden] = useState(wasDismissed);
  const ref = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden || !ref.current) {
      root.style.removeProperty('--bardo-notice-height');
      return undefined;
    }
    const update = () => {
      const node = ref.current;
      if (!node) return;
      // El contenedor no tiene márgenes externos: su offsetHeight es todo lo que ocupa.
      root.style.setProperty('--bardo-notice-height', `${node.offsetHeight}px`);
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(ref.current);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--bardo-notice-height');
    };
  }, [hidden]);

  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Sin almacenamiento: se oculta durante esta sesión.
    }
    setHidden(true);
  };

  return (
    <div ref={ref} className="beta-notice-wrap">
      <div className="beta-notice" role="note" aria-label="Aviso de beta">
      <p className="beta-notice-text">
        <span className="beta-notice-badge">Beta</span>
        Bardo está en beta. Si algo no funciona, cuéntanos en el chat del canal.
      </p>
      <IconButton label="Cerrar aviso de beta" size="icon-xs" onClick={dismiss} className="shrink-0">
        <Xmark width={14} height={14} />
      </IconButton>
      </div>
    </div>
  );
}
