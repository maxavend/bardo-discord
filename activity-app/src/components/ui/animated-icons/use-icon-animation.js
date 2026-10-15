// Anima un ícono de lucide-animated desde su control (botón, pestaña), no solo
// al pasar por encima del ícono. Respeta «reducir movimiento». Con un ícono
// estático (sin startAnimation) no hace nada.
import {useCallback, useEffect, useRef} from 'react';
import {useReducedMotion} from 'motion/react';

const PLAY_MS = 700;

export function useIconAnimation() {
  const iconRef = useRef(null);
  const timer = useRef(0);
  const reduced = useReducedMotion();

  const start = useCallback(() => {
    if (reduced) return;
    clearTimeout(timer.current);
    iconRef.current?.startAnimation?.();
  }, [reduced]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    iconRef.current?.stopAnimation?.();
  }, []);

  /** Una pasada completa (por ejemplo, al quedar activa una pestaña). */
  const play = useCallback(() => {
    if (reduced) return;
    iconRef.current?.startAnimation?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => iconRef.current?.stopAnimation?.(), PLAY_MS);
  }, [reduced]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    iconRef,
    play,
    handlers: {onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop},
  };
}
