// Un motor de Tareas por canal, compartido por Inicio y el tablero.
import {useEffect, useSyncExternalStore} from 'react';
import {toast} from '@/lib/toast';
import {getDocsStorageScope} from '../docs-storage.js';
import {isPlannerRemoteEnabled} from '../planner/planner-sync.js';
import {createKanbanEngine, KANBAN_POLL_MS} from './kanban-sync.js';

let engine = null;
let engineScope = null;
let loadPromise = null;

export function getKanbanEngine() {
  const scope = getDocsStorageScope() || 'local';
  if (!engine || engineScope !== scope) {
    engineScope = scope;
    loadPromise = null;
    engine = createKanbanEngine({
      remote: isPlannerRemoteEnabled(),
      onNotice: ({message}) => toast(message),
    });
  }
  return engine;
}

/** Carga el tablero una vez por sesión (Inicio y Tareas comparten la misma carga). */
export function ensureKanbanLoaded() {
  const current = getKanbanEngine();
  if (!loadPromise) loadPromise = current.load();
  return loadPromise;
}

export function reloadKanban() {
  loadPromise = null;
  return ensureKanbanLoaded();
}

export function useKanbanSnapshot() {
  const current = getKanbanEngine();
  return useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot);
}

/** Poll cada 4 s mientras la vista está visible; se pausa con la pestaña oculta. */
export function useKanbanPolling(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const current = getKanbanEngine();
    void ensureKanbanLoaded();
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void current.poll();
    };
    const timer = setInterval(tick, KANBAN_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    const flushOnHide = () => current.flushNow();
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', flushOnHide);
      current.flushNow();
    };
  }, [enabled]);
}

export function currentUserId() {
  return (typeof window !== 'undefined' && window.__BARDO_USER__?.id) || null;
}
