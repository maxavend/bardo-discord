import {useState} from 'react';
import {ChevronDown} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field, FieldDescription, FieldLabel} from '@/components/ui/field';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {renameWorkspace, useWorkspace, WORKSPACE_NAME_MAX} from './workspace.js';

/**
 * Nombre del espacio en el header. Al tocarlo se puede cambiar; vacío vuelve
 * al nombre del canal.
 */
export function WorkspaceMenu() {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState({saving: false, error: null});
  const fallback = workspace.channelName ? `#${workspace.channelName}` : 'Bardo';

  const onOpenChange = next => {
    setOpen(next);
    if (next) {
      setDraft(workspace.customName || '');
      setState({saving: false, error: null});
    }
  };

  const save = async event => {
    event.preventDefault();
    setState({saving: true, error: null});
    try {
      await renameWorkspace(draft);
      setOpen(false);
    } catch (error) {
      setState({saving: false, error: error?.message || 'No se pudo guardar el nombre. Inténtalo de nuevo.'});
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={(
          <button
            type="button"
            className="topbar-title home-brand workspace-trigger"
            aria-label={`Espacio: ${workspace.displayName}. Cambiar nombre`}
          >
            <span className="workspace-name">{workspace.displayName}</span>
            <ChevronDown width={12} height={12} aria-hidden="true" className="text-muted-foreground" />
          </button>
        )}
      />
      <PopoverContent align="start" className="w-72 p-4">
        <form className="flex flex-col gap-3" onSubmit={save}>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">Nombre del espacio</p>
            <p className="text-xs text-muted-foreground">
              {workspace.remote
                ? [workspace.guildName, workspace.channelName && `#${workspace.channelName}`].filter(Boolean).join(' · ') || 'Este canal'
                : 'Solo en este dispositivo'}
            </p>
          </div>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="workspace-name" className="sr-only">Nombre del espacio</FieldLabel>
            <Input
              id="workspace-name"
              autoFocus
              value={draft}
              maxLength={WORKSPACE_NAME_MAX}
              placeholder={fallback}
              onChange={event => setDraft(event.target.value)}
              className="h-9"
            />
            <FieldDescription className="text-xs">
              {workspace.remote ? 'Lo ve todo el canal. ' : ''}Si lo dejas vacío, se usa {workspace.channelName ? 'el nombre del canal' : '«Bardo»'}.
            </FieldDescription>
          </Field>
          {state.error && <p className="text-xs text-destructive" role="alert">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={state.saving || draft.trim() === (workspace.customName || '')}>
              {state.saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
