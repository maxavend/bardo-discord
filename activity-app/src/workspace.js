// Nombre del espacio de trabajo del canal: el que alguien eligió, o el del
// canal de Discord, o "Bardo" cuando no hay canal (modo local).
import {useEffect, useState} from 'react';
import {scopedDocsKey} from './docs-storage.js';
import {isPlannerRemoteEnabled} from './planner/planner-sync.js';
import {applySettingsSnapshot, patchSettings} from './settings/settings-client.js';

export const WORKSPACE_NAME_MAX = 60;
const LOCAL_KEY = 'bardo.workspace.name.v1';
const CHANGE_EVENT = 'bardo-workspace-change';

function readLocalName() {
  try {
    return localStorage.getItem(scopedDocsKey(LOCAL_KEY)) || null;
  } catch {
    return null;
  }
}

export function workspaceInfo() {
  const context = (typeof window !== 'undefined' && window.__bardoChannelContext) || {};
  const remote = isPlannerRemoteEnabled();
  const customName = (remote ? context.workspaceName : readLocalName()) || null;
  const channelName = context.channelName || context.channel?.name || null;
  const guildName = context.guildName || context.guild?.name || null;
  return {
    customName,
    channelName,
    guildName,
    remote,
    displayName: customName || (channelName ? `#${channelName}` : 'Bardo'),
  };
}

/** Cambia el nombre para todo el canal (o solo en este dispositivo, sin Discord). */
export async function renameWorkspace(rawName) {
  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, WORKSPACE_NAME_MAX);
  if (isPlannerRemoteEnabled()) {
    applySettingsSnapshot(await patchSettings('space', {name}));
    return workspaceInfo();
  } else {
    try {
      if (name) localStorage.setItem(scopedDocsKey(LOCAL_KEY), name);
      else localStorage.removeItem(scopedDocsKey(LOCAL_KEY));
    } catch {
      // Sin almacenamiento: el nombre dura esta sesión.
    }
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  return workspaceInfo();
}

export function useWorkspace() {
  const [info, setInfo] = useState(workspaceInfo);
  useEffect(() => {
    const update = () => setInfo(workspaceInfo());
    window.addEventListener(CHANGE_EVENT, update);
    // El contexto del canal puede llegar después del primer render.
    window.addEventListener('bardo-home-status', update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener('bardo-home-status', update);
    };
  }, []);
  return info;
}
