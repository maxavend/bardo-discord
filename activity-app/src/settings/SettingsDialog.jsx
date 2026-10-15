import {useCallback, useEffect, useMemo, useState} from 'react';
import {CircleCheck, CircleInfo, CircleXmark, ChevronDown} from '@gravity-ui/icons';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Switch} from '@/components/ui/switch';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {ToggleGroup, ToggleGroupItem} from '@/components/ui/toggle-group';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from '@/components/ui/command';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {OverlayScrollArea} from '@/components/ui/scroll-area';
import {SHEET_DIALOG_CLASS, SHEET_DIALOG_SCROLL_CLASS} from '@/components/sheet-dialog.js';
import {useTheme} from '@/lib/theme';
import {toast} from '@/lib/toast';
import {cn} from '@/lib/utils';
import {renameWorkspace, useWorkspace, WORKSPACE_NAME_MAX} from '../workspace.js';
import {
  applySettingsSnapshot,
  describeTimeZone,
  deviceTimeZone,
  fetchSettings,
  getStartModulePreference,
  listTimeZones,
  patchSettings,
  setStartModulePreference,
} from './settings-client.js';

const SOURCE_TEXT = {
  space: 'Elegido para este canal',
  server: 'Igual que el servidor',
  default: 'Valor de Bardo',
};

function Section({title, description, children}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60">{children}</div>
    </section>
  );
}

function Row({label, hint, children, htmlFor}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        {htmlFor
          ? <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">{label}</label>
          : <span className="text-[13px] font-medium text-foreground">{label}</span>}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function LockedNotice({children}) {
  return <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="note">{children}</p>;
}

function TimeZonePicker({value, inheritLabel, onChange, disabled, id}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => listTimeZones(), []);
  const label = value ? describeTimeZone(value) : inheritLabel;
  const pick = next => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button id={id} variant="outline" size="sm" disabled={disabled} className="h-8 max-w-[15rem] justify-between gap-2 px-3 text-xs font-medium">
            <span className="truncate">{label}</span>
            <ChevronDown width={12} height={12} aria-hidden="true" />
          </Button>
        )}
      />
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar ciudad o región…" className="text-xs" />
          <CommandList className="max-h-64">
            <CommandEmpty>No encontramos esa zona horaria.</CommandEmpty>
            {inheritLabel && (
              <CommandGroup>
                <CommandItem value={`__inherit__ ${inheritLabel}`} onSelect={() => pick(null)} className="cursor-pointer text-xs">
                  {inheritLabel}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Zonas horarias">
              {zones.map(zone => (
                <CommandItem key={zone} value={zone} onSelect={() => pick(zone)} data-checked={zone === value} className="cursor-pointer text-xs">
                  {describeTimeZone(zone)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BotChecks({bot}) {
  if (!bot) return null;
  if (!bot.available) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {bot.unavailable ? 'Discord no respondió. Vuelve a abrir Ajustes en un momento.' : 'El bot de Bardo no está configurado en este entorno.'}
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {bot.checks.map(check => {
        const Icon = check.ok === true ? CircleCheck : check.ok === false ? CircleXmark : CircleInfo;
        return (
          <li key={check.id} className="flex gap-3 px-4 py-3">
            <Icon
              width={16}
              height={16}
              aria-hidden="true"
              className={cn('mt-0.5 shrink-0', check.ok === true ? 'text-primary' : check.ok === false ? 'text-destructive' : 'text-muted-foreground')}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">
                <span className="sr-only">{check.ok === true ? 'Funciona: ' : check.ok === false ? 'No funciona: ' : 'Depende: '}</span>
                {check.label}
              </span>
              {check.detail && <span className="text-xs text-muted-foreground">{check.detail}</span>}
              {check.ok === false && <span className="text-xs text-muted-foreground">Pídeselo a quien administra el servidor.</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PersonalTab({snapshot, remote, onPatch, saving}) {
  const {theme, setTheme} = useTheme('system');
  const [startModule, setStartModule] = useState(getStartModulePreference);
  return (
    <div className="flex flex-col gap-6">
      <Section title="Apariencia" description="Solo en este dispositivo.">
        <Row label="Tema">
          <ToggleGroup
            value={[theme || 'system']}
            onValueChange={value => {
              const next = Array.isArray(value) ? value.at(-1) : value;
              if (next) setTheme(next);
            }}
            variant="outline"
            size="sm"
            aria-label="Tema"
          >
            <ToggleGroupItem value="light" className="h-7 px-3 text-xs">Claro</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="h-7 px-3 text-xs">Oscuro</ToggleGroupItem>
            <ToggleGroupItem value="system" className="h-7 px-3 text-xs">Sistema</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label="Al abrir Bardo" hint="Con /bardo o desde el lanzador de actividades.">
          <ToggleGroup
            value={[startModule]}
            onValueChange={value => {
              const next = Array.isArray(value) ? value.at(-1) : value;
              if (!next) return;
              setStartModule(next);
              setStartModulePreference(next);
            }}
            variant="outline"
            size="sm"
            aria-label="Al abrir Bardo"
          >
            <ToggleGroupItem value="home" className="h-7 px-3 text-xs">Inicio</ToggleGroupItem>
            <ToggleGroupItem value="last" className="h-7 px-3 text-xs">Lo último que usaste</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Section>
      <Section title="Avisos" description="Para ti en todos los servidores donde está Bardo.">
        <Row
          label="Mensaje directo cuando te asignan una tarea"
          hint={remote ? 'Si lo apagas, igual verás la mención en el canal.' : 'Disponible al abrir Bardo en Discord.'}
          htmlFor="settings-personal-dm"
        >
          <Switch
            id="settings-personal-dm"
            checked={remote ? snapshot?.personal?.taskDmNotices !== false : false}
            disabled={!remote || saving}
            onCheckedChange={checked => onPatch('personal', {taskDmNotices: Boolean(checked)})}
          />
        </Row>
      </Section>
    </div>
  );
}

function NoticeSwitches({level, values, effective, sources, canEdit, saving, onPatch}) {
  const items = [
    ['taskChannelNotices', 'Mencionar en el canal al asignar una tarea', `settings-${level}-channel`],
    ['taskDmNotices', 'Enviar un mensaje directo a quien recibe la tarea', `settings-${level}-dm`],
  ];
  return items.map(([key, label, id]) => {
    const value = level === 'space' ? effective[key] : (values[key] ?? effective.defaults?.[key] ?? true);
    const overridden = level === 'space' && sources?.[key] === 'space';
    return (
      <Row
        key={key}
        label={label}
        htmlFor={id}
        hint={level === 'space'
          ? (
            <>
              {SOURCE_TEXT[sources?.[key]] || ''}
              {overridden && canEdit && (
                <button type="button" className="ml-2 underline underline-offset-2" onClick={() => onPatch(level, {[key]: null})}>
                  Usar lo del servidor
                </button>
              )}
            </>
          )
          : 'Vale para los canales que no eligieron otra cosa.'}
      >
        <Switch id={id} checked={Boolean(value)} disabled={!canEdit || saving} onCheckedChange={checked => onPatch(level, {[key]: Boolean(checked)})} />
      </Row>
    );
  });
}

function SpaceNameRow({canEdit}) {
  const workspace = useWorkspace();
  const [draft, setDraft] = useState(workspace.customName || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(workspace.customName || ''), [workspace.customName]);
  const fallback = workspace.channelName ? `#${workspace.channelName}` : 'Bardo';
  const dirty = draft.replace(/\s+/g, ' ').trim() !== (workspace.customName || '');
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await renameWorkspace(draft);
      toast('Nombre guardado.');
    } catch (error) {
      toast(error?.message || 'No se pudo guardar el nombre. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-2 px-4 py-3">
      <label htmlFor="settings-space-name" className="text-[13px] font-medium text-foreground">Nombre del espacio</label>
      <div className="flex items-center gap-2">
        <Input
          id="settings-space-name"
          value={draft}
          maxLength={WORKSPACE_NAME_MAX}
          placeholder={fallback}
          disabled={!canEdit}
          onChange={event => setDraft(event.target.value)}
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={!canEdit || !dirty || saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
      </div>
      <span className="text-xs text-muted-foreground">
        Aparece arriba a la izquierda. Si lo dejas vacío, se usa {workspace.channelName ? 'el nombre del canal' : '«Bardo»'}.
      </span>
    </form>
  );
}

function SpaceTab({snapshot, remote, onPatch, saving}) {
  const canEdit = !remote || Boolean(snapshot?.permissions?.canEditSpace);
  const effective = snapshot?.effective;
  const serverZone = snapshot?.server?.timeZone || snapshot?.defaults?.timeZone;
  return (
    <div className="flex flex-col gap-6">
      {remote && !canEdit && <LockedNotice>Solo quien gestiona este canal en Discord puede cambiar estos ajustes. Puedes verlos igual.</LockedNotice>}
      <Section title="Este canal" description={remote ? 'Lo ve todo el canal.' : 'Solo en este dispositivo.'}>
        <SpaceNameRow canEdit={canEdit} />
        <Row
          label="Zona horaria"
          htmlFor="settings-space-tz"
          hint={remote ? `Define «hoy», las tareas vencidas y las fechas de /tarea y /reu-new. ${SOURCE_TEXT[effective?.sources?.timeZone] || ''}.` : 'Sin Discord se usa la de este dispositivo.'}
        >
          {remote ? (
            <TimeZonePicker
              id="settings-space-tz"
              value={snapshot?.space?.timeZone || null}
              inheritLabel={`Igual que el servidor (${describeTimeZone(serverZone)})`}
              disabled={!canEdit || saving}
              onChange={timeZone => onPatch('space', {timeZone})}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{describeTimeZone(deviceTimeZone())}</span>
          )}
        </Row>
      </Section>
      {remote && effective && (
        <Section title="Avisos de Tareas" description="Qué hace Bardo cuando alguien recibe una tarea en este canal.">
          <NoticeSwitches level="space" values={snapshot.space} effective={effective} sources={effective.sources} canEdit={canEdit} saving={saving} onPatch={onPatch} />
        </Section>
      )}
      {remote && (
        <Section title="Bardo en este canal" description="Lo que el bot puede hacer aquí, según sus permisos de Discord.">
          <BotChecks bot={snapshot?.bot} />
        </Section>
      )}
    </div>
  );
}

function ServerTab({snapshot, remote, onPatch, saving}) {
  if (!remote) {
    return <LockedNotice>Los ajustes del servidor se ven al abrir Bardo en Discord.</LockedNotice>;
  }
  const canEdit = Boolean(snapshot?.permissions?.canEditServer);
  const server = snapshot?.server || {};
  const defaults = snapshot?.defaults || {};
  return (
    <div className="flex flex-col gap-6">
      {!canEdit && <LockedNotice>Solo quien administra el servidor en Discord puede cambiar estos ajustes. Puedes verlos igual.</LockedNotice>}
      <Section title="Para todo el servidor" description="Valores por defecto de los canales que no eligieron otra cosa.">
        <Row
          label="Zona horaria"
          htmlFor="settings-server-tz"
          hint={server.timeZoneDetected ? 'Detectada en el dispositivo de la primera persona que abrió Bardo.' : server.timeZone ? null : `Valor de Bardo: ${describeTimeZone(defaults.timeZone)}.`}
        >
          <TimeZonePicker
            id="settings-server-tz"
            value={server.timeZone || defaults.timeZone}
            disabled={!canEdit || saving}
            onChange={timeZone => onPatch('server', {timeZone})}
          />
        </Row>
        <NoticeSwitches
          level="server"
          values={server}
          effective={{defaults}}
          canEdit={canEdit}
          saving={saving}
          onPatch={onPatch}
        />
      </Section>
    </div>
  );
}

export function SettingsDialog({open, initialTab = 'personal', onClose, remote}) {
  const [tab, setTab] = useState(initialTab);
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState({loading: false, error: null, saving: false});

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !remote) return undefined;
    let cancelled = false;
    setState(previous => ({...previous, loading: true, error: null}));
    fetchSettings()
      .then(data => {
        if (cancelled) return;
        setSnapshot(data);
        setState(previous => ({...previous, loading: false}));
      })
      .catch(error => {
        if (!cancelled) setState(previous => ({...previous, loading: false, error: error?.message || 'No se pudieron cargar los ajustes.'}));
      });
    return () => { cancelled = true; };
  }, [open, remote]);

  const onPatch = useCallback(async (section, fields) => {
    setState(previous => ({...previous, saving: true}));
    try {
      const next = await patchSettings(section, fields);
      setSnapshot(next);
      if (section !== 'personal') applySettingsSnapshot(next);
    } catch (error) {
      toast(error?.message || 'No se pudo guardar el ajuste. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setState(previous => ({...previous, saving: false}));
    }
  }, []);

  const props = {snapshot, remote, onPatch, saving: state.saving};
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      {/* Anclado arriba en escritorio: cambiar de pestaña no lo hace saltar. */}
      <DialogContent scrollable={false} className={cn('sm:max-w-xl', SHEET_DIALOG_CLASS, 'sm:top-[max(4.5rem,9vh)] sm:translate-y-0')}>
        <OverlayScrollArea className={SHEET_DIALOG_SCROLL_CLASS} contentClassName="grid gap-5 p-1">
          <DialogHeader>
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>Cada sección dice a quién afecta: solo a ti, a este canal o a todo el servidor.</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={setTab} className="gap-5">
            <TabsList className="w-full">
              <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
              <TabsTrigger value="space" className="text-xs">Espacio</TabsTrigger>
              <TabsTrigger value="server" className="text-xs">Servidor</TabsTrigger>
            </TabsList>
            {remote && state.loading && !snapshot && <p className="text-sm text-muted-foreground" role="status">Cargando ajustes…</p>}
            {remote && state.error && !snapshot && (
              <div className="flex flex-col items-start gap-2" role="alert">
                <p className="text-sm text-destructive">{state.error}</p>
                <Button variant="secondary" size="sm" onClick={() => { setState(previous => ({...previous, error: null})); onClose(); }}>Cerrar</Button>
              </div>
            )}
            <TabsContent value="personal"><PersonalTab {...props} /></TabsContent>
            <TabsContent value="space">{(!remote || snapshot) && <SpaceTab {...props} />}</TabsContent>
            <TabsContent value="server">{(!remote || snapshot) && <ServerTab {...props} />}</TabsContent>
          </Tabs>
        </OverlayScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsDialog;
