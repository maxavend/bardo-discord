import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { ChevronDown, Plus } from 'lucide-react';
import { XIcon } from '@/components/ui/animated-icons';
import { isProductionActivity, shouldLoadDemoFixture } from './planner-store.js';

export const DEFAULT_DISCORD_MEMBERS = [
  { id: 'u-1', type: 'user', username: 'nico.g', globalName: 'Nico G', tag: '@Nico G', avatarColor: '#5865F2' },
  { id: 'u-2', type: 'user', username: 'camila.carreno', globalName: 'Camila Carreño', tag: '@Camila Carreño', avatarColor: '#EB459E' },
  { id: 'u-3', type: 'user', username: 'daniela', globalName: 'Daniela', tag: '@Daniela', avatarColor: '#57F287' },
  { id: 'u-4', type: 'user', username: 'javi.acuna', globalName: 'Javi Acuña', tag: '@Javi Acuña', avatarColor: '#FEE75C' },
  { id: 'u-5', type: 'user', username: 'max.avendano', globalName: 'Max Avendaño', tag: '@Max Avendaño', avatarColor: '#00A8FC' },
  { id: 'u-6', type: 'user', username: 'carol.t', globalName: 'Carol T', tag: '@Carol T', avatarColor: '#ED4245' },
  { id: 'u-7', type: 'user', username: 'karola', globalName: 'Karola', tag: '@Karola', avatarColor: '#9B59B6' },
  { id: 'u-8', type: 'user', username: 'paula.molina', globalName: 'Paula Molina', tag: '@Paula Molina', avatarColor: '#E67E22' },
];

export const DEFAULT_DISCORD_ROLES = [
  { id: 'r-1', type: 'role', name: 'Diseño & SD', tag: '@Diseño & SD', color: '#5865F2' },
  { id: 'r-2', type: 'role', name: 'Equipo de Desarrollo', tag: '@Devs', color: '#57F287' },
  { id: 'r-3', type: 'role', name: 'Líderes de Proyecto', tag: '@Líderes', color: '#FEE75C' },
  { id: 'r-4', type: 'role', name: 'Frontend', tag: '@Frontend', color: '#00A8FC' },
  { id: 'r-5', type: 'role', name: 'Todos en el canal', tag: '@todos', color: '#EB459E' },
];

export const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function customParticipantsKey() {
  if (typeof window === 'undefined' || !isProductionActivity()) return 'bardo_discord_custom_participants';
  return `bardo_discord_custom_participants@${window.__BARDO_GUILD_ID__}:${window.__BARDO_CHANNEL_ID__}:${window.__BARDO_USER__?.id}`;
}

export function getSavedCustomParticipants() {
  try {
    const raw = localStorage.getItem(customParticipantsKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => typeof item?.tag === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomParticipant(item) {
  try {
    const list = getSavedCustomParticipants();
    if (!list.some((existing) => existing.tag.toLowerCase() === item.tag.toLowerCase())) {
      const next = [...list, item];
      localStorage.setItem(customParticipantsKey(), JSON.stringify(next));
    }
  } catch {}
}

export function getAllDiscordEntities() {
  const isProduction = isProductionActivity();
  const channelContext = (typeof window !== 'undefined' && window.__bardoChannelContext) || null;
  const liveParticipants = (typeof window !== 'undefined' && window.__bardoLiveParticipants) || [];
  const custom = getSavedCustomParticipants();

  let members = [];
  let roles = [];

  if (channelContext) {
    roles = (channelContext.roles || []).map((r) => ({
      id: r.id,
      type: 'role',
      name: r.name,
      tag: r.tag || `@${r.name}`,
      color: r.color || '#5865F2',
      memberCount: Number.isFinite(r.memberCount) ? r.memberCount : null,
    }));

    members = (channelContext.members || []).map((m, idx) => ({
      id: m.id,
      type: 'user',
      username: m.username,
      globalName: m.globalName || m.username,
      tag: m.tag || `@${m.globalName || m.username}`,
      avatar: m.avatar,
      roles: m.roles || [],
      avatarColor: DISCORD_PALETTES[idx % DISCORD_PALETTES.length],
    }));
  } else if (!isProduction && shouldLoadDemoFixture()) {
    members = [...DEFAULT_DISCORD_MEMBERS];
    roles = [...DEFAULT_DISCORD_ROLES];
  }

  // Prioritize active participants in call/activity
  liveParticipants.forEach((p, idx) => {
    const existingIndex = members.findIndex((m) => m.id === p.id || m.username === p.username);
    if (existingIndex >= 0) {
      members[existingIndex].inCall = true;
      if (p.globalName) members[existingIndex].globalName = p.globalName;
      if (p.avatar) members[existingIndex].avatar = p.avatar;
    } else {
      members.unshift({
        id: p.id,
        type: 'user',
        username: p.username,
        globalName: p.globalName || p.username,
        tag: `@${p.globalName || p.username}`,
        avatar: p.avatar,
        avatarColor: p.avatarColor || DISCORD_PALETTES[idx % DISCORD_PALETTES.length],
        inCall: true,
      });
    }
  });

  // Ensure current user is in members list
  if (typeof window !== 'undefined' && window.__BARDO_USER__) {
    const u = window.__BARDO_USER__;
    if (!members.some((m) => m.id === u.id)) {
      members.unshift({
        id: u.id,
        type: 'user',
        username: u.username,
        globalName: u.global_name || u.username,
        tag: `@${u.global_name || u.username}`,
        avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
        avatarColor: '#5865F2',
        isMe: true,
      });
    }
  }

  custom.forEach((c) => {
    if (!members.some((m) => m.tag.toLowerCase() === c.tag.toLowerCase())) {
      members.push(c);
    }
  });

  return { members, roles };
}

/** The channel's whole member list is loaded: search locally, no Discord round trip. */
function hasCompleteDirectory() {
  return Boolean(typeof window !== 'undefined' && window.__bardoChannelContext?.memberDirectory?.complete);
}

/** A person of the directory by display name, @tag or username (case-insensitive). */
export function findMemberByName(name, members = getAllDiscordEntities().members) {
  const key = String(name || '').trim().replace(/^@/, '').toLowerCase();
  if (!key) return null;
  return members.find((member) => [member.globalName, member.username, member.tag?.replace(/^@/, '')]
    .some((value) => String(value || '').toLowerCase() === key)) || null;
}

/** Comma-separated names ("Ana, Pedro") ↔ list; used for one or more facilitators. */
export function splitPeople(value = '') {
  return String(value || '').split(',').map((name) => name.trim().replace(/^@/, '')).filter(Boolean);
}

/** Discord photo when the person is known, initials on their color otherwise. */
export function MemberAvatar({name = '', member = undefined, size = 'xs', className = ''}) {
  const match = member === undefined ? findMemberByName(name) : member;
  const label = match?.globalName || String(name || '').replace(/^@/, '') || '?';
  const color = match?.avatarColor
    || DISCORD_PALETTES[[...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DISCORD_PALETTES.length];
  return (
    <Avatar size={size} className={`font-bold shrink-0 shadow-2xs ${className}`} style={{ backgroundColor: `${color}30`, color }}>
      {match?.avatar && <AvatarImage src={match.avatar} alt="" />}
      <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function useDiscordDirectory(query, active = true) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const retryAt = useRef(0);
  const search = query.trim().replace(/^@/, '');
  const production = isProductionActivity();
  const complete = hasCompleteDirectory();
  const scope = production ? `${window.__BARDO_GUILD_ID__}:${window.__BARDO_CHANNEL_ID__}:${window.__BARDO_USER__?.id}` : 'local';
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('bardo-participants-change', update);
    return () => window.removeEventListener('bardo-participants-change', update);
  }, []);
  useEffect(() => {
    if (!production || complete || !active || search.length < 2 || search.length > 100) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/discord/members?${new URLSearchParams({query: search})}`, {
          headers: {Authorization: `Bearer ${window.__BARDO_SESSION_TOKEN__}`},
          cache: 'no-store', signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const wait = Math.max(Number(payload.retryAfterMs) || 0, Number(response.headers.get('Retry-After')) * 1000 || 0);
          retryAt.current = Date.now() + wait;
          setResult({search, scope, members: [], error: true,
            message: wait ? `Discord está ocupado. Inténtalo de nuevo en ${Math.ceil(wait / 1000)} segundos.` : (payload.message || 'No se pudo buscar en Discord. Inténtalo de nuevo o agrega a la persona como invitada.')});
          return;
        }
        setResult({...payload, search, scope});
      } catch {
        if (!controller.signal.aborted) setResult({search, scope, members: [], error: true, message: 'No se pudo conectar con Discord. Inténtalo de nuevo o agrega a la persona como invitada.'});
      }
    }, Math.max(300, retryAt.current - Date.now()));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [production, complete, active, search, scope, retry]);
  // Read local suggestions on render; live participant events trigger revision.
  void revision;
  const entities = getAllDiscordEntities();
  const current = result?.search === search && result?.scope === scope ? result : null;
  const byId = new Map(entities.members.map(member => [member.id, member]));
  for (const [index, member] of (current?.members || []).entries()) {
    byId.set(member.id, {...member, avatarColor: DISCORD_PALETTES[index % DISCORD_PALETTES.length], ...byId.get(member.id)});
  }
  const message = !production || complete ? '' : search.length < 2
    ? 'Escribe al menos 2 letras.'
    : search.length > 100 ? 'La búsqueda admite hasta 100 caracteres.'
    : !current ? 'Buscando en Discord…'
    : current.message || (current.truncated ? 'Hay más coincidencias. Escribe un nombre más completo.' : 'Puede que no todas tengan acceso a este canal.');
  return {...entities, members: [...byId.values()], message, failed: current?.error,
    retry: () => { setResult(null); setRetry(value => value + 1); }};
}

function roleHint(role) {
  if (role.memberCount === null || role.memberCount === undefined) return role.tag;
  return role.memberCount === 1 ? '1 persona' : `${role.memberCount} personas`;
}

function DirectoryStatus({directory}) {
  if (!directory.message) return null;
  return <div className="px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
    {directory.message}
    {directory.failed && <button type="button" className="ml-2 underline" onClick={directory.retry}>Reintentar búsqueda</button>}
  </div>;
}

function parseMentionsToArray(mentionsStr) {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim()).filter(Boolean);
  }
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

export function PlannerMemberPicker({
  value = '',
  onChange,
  _variant = 'secondary',
  singleSelect = false,
  hideRoles = false,
  placeholder = 'Buscar personas o roles…',
  onPickMember,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const directory = useDiscordDirectory(searchQuery, isOpen);

  const selectedTags = parseMentionsToArray(value);
  const selectedSet = new Set(selectedTags.map((t) => (t.startsWith('@') ? t : `@${t}`)));
  const { members, roles } = directory;

  const handleToggleTag = (tag) => {
    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;

    if (singleSelect) {
      if (selectedSet.has(cleanTag)) {
        onChange('');
        onPickMember?.(null);
      } else {
        onChange(cleanTag);
        onPickMember?.(members.find((m) => m.tag.toLowerCase() === cleanTag.toLowerCase()) || null);
      }
      setIsOpen(false);
      return;
    }

    const nextKeys = new Set(Array.from(selectedSet));
    if (nextKeys.has(cleanTag)) {
      nextKeys.delete(cleanTag);
    } else {
      nextKeys.add(cleanTag);
    }
    onChange(Array.from(nextKeys).join(' '));
  };

  const handleRemoveTag = (tagToRemove, e) => {
    e?.stopPropagation();
    if (singleSelect) {
      onChange('');
      onPickMember?.(null);
      return;
    }
    const nextKeys = new Set(Array.from(selectedSet));
    nextKeys.delete(tagToRemove);
    onChange(Array.from(nextKeys).join(' '));
  };

  const handleAddGuest = (name) => {
    const rawName = name.trim().replace(/^@/, '');
    if (!rawName) return;
    const cleanTag = `@${rawName}`;

    saveCustomParticipant({
      id: `custom-${Date.now().toString(36)}`,
      type: 'user',
      globalName: rawName,
      username: rawName.toLowerCase().replace(/\s+/g, '.'),
      tag: cleanTag,
      avatarColor:
        DISCORD_PALETTES[
          Math.abs(
            rawName
              .split('')
              .reduce((acc, c) => acc + c.charCodeAt(0), 0)
          ) % DISCORD_PALETTES.length
        ],
    });

    if (singleSelect) {
      onChange(cleanTag);
      onPickMember?.(null);
      setIsOpen(false);
    } else {
      const nextKeys = new Set(Array.from(selectedSet));
      nextKeys.add(cleanTag);
      onChange(Array.from(nextKeys).join(' '));
    }
    setSearchQuery('');
  };

  const hasExactMatch = [...roles, ...members].some(
    (e) =>
      e.tag.toLowerCase() === `@${searchQuery.trim()}`.toLowerCase() ||
      e.tag.toLowerCase() === searchQuery.trim().toLowerCase() ||
      (e.globalName || e.name || '').toLowerCase() === searchQuery.trim().toLowerCase()
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <div
            onClick={() => {
              setIsOpen(true);
            }}
            className="min-h-10 w-full px-3 py-1.5 rounded-3xl bg-input/50 border border-transparent hover:border-border/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 transition-all flex items-center justify-between gap-2 flex-wrap cursor-text"
          >
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              {Array.from(selectedSet).map((tag) => {
                const matchedRole = roles.find((r) => r.tag.toLowerCase() === tag.toLowerCase());
                const matchedMember = members.find((m) => m.tag.toLowerCase() === tag.toLowerCase());
                const label = matchedRole?.name || matchedMember?.globalName || tag;
                const color = matchedRole?.color || matchedMember?.avatarColor || '#5865F2';

                // Avatar inset = vertical padding, so the photo sits evenly inside the pill.
                return (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className={`gap-1.5 py-1 pr-2.5 rounded-xl border border-border/50 text-xs font-medium text-foreground min-w-0 max-w-full ${matchedRole ? 'pl-2.5' : 'pl-1'}`}
                  >
                    {matchedRole ? (
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                    ) : (
                      <MemberAvatar name={label} member={matchedMember || null} size="xxs" />
                    )}
                    <span className="truncate">{label}</span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveTag(tag, e)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm cursor-pointer ml-0.5"
                      aria-label={`Quitar a ${label}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                );
              })}
              <span className="text-xs text-muted-foreground">{selectedSet.size === 0 ? placeholder : ''}</span>
            </div>
            <ChevronDown className={`size-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        }
      />

      <PopoverContent align="start" className="w-[300px] p-0 overflow-hidden">
        <Command className="w-full">
          <CommandInput 
            placeholder="Buscar…" 
            value={searchQuery} 
            onValueChange={setSearchQuery} 
          />
          {searchQuery.trim() && !hasExactMatch && (
            <div className="p-1 border-b border-border/40">
              <button
                type="button"
                onClick={() => handleAddGuest(searchQuery)}
                className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="size-3.5 shrink-0" />
                <span className="truncate">
                  Agregar a «<strong>{searchQuery.trim()}</strong>» como invitado
                </span>
              </button>
            </div>
          )}

          <DirectoryStatus directory={directory} />
          <CommandList className="max-h-64">
            <CommandEmpty>No hay resultados para esta búsqueda.</CommandEmpty>

            {!hideRoles && roles.length > 0 && (
              <CommandGroup heading="Roles del servidor">
                {roles.map((role) => {
                  const isSelected = selectedSet.has(role.tag);
                  return (
                    <CommandItem
                      key={role.tag}
                      value={`${role.name} ${role.tag}`}
                      onSelect={() => handleToggleTag(role.tag)}
                      data-checked={isSelected}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="size-4 rounded-md text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                          style={{ backgroundColor: role.color }}
                        >
                          #
                        </span>
                        <span className="text-xs font-medium text-foreground truncate">{role.name}</span>
                        <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">{roleHint(role)}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!hideRoles && roles.length > 0 && members.length > 0 && <CommandSeparator />}

            {members.length > 0 && (
              <CommandGroup heading={hasCompleteDirectory() ? 'Personas del canal e invitados' : 'Personas del servidor e invitados'}>
                {members.map((member) => {
                  const isSelected = selectedSet.has(member.tag);
                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.globalName} ${member.username} ${member.tag}`}
                      onSelect={() => handleToggleTag(member.tag)}
                      data-checked={isSelected}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Avatar
                          size="xs"
                          className="size-5 text-[9px] font-bold shrink-0 shadow-2xs"
                          style={{
                            backgroundColor: `${member.avatarColor}30`,
                            color: member.avatarColor,
                          }}
                        >
                          {member.avatar && <AvatarImage src={member.avatar} alt="" />}
                          <AvatarFallback style={{ backgroundColor: `${member.avatarColor}30`, color: member.avatarColor }}>
                            {member.globalName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-foreground truncate">{member.globalName}</span>
                        <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">{member.inCall ? 'En la actividad' : member.tag}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SearchableParticipantMenu({
  selectedKeys = new Set(),
  onSelectionChange,
  onAddCustomParticipant,
  singleSelect = false,
  hideRoles = false,
  placeholder,
  onClear,
  clearLabel = 'Quitar selección',
  allowGuests = true,
  onSelectMember,
  memberFilter,
}) {
  const [searchValue, setSearchValue] = useState('');
  const directory = useDiscordDirectory(searchValue);
  const { roles } = directory;
  // Tareas necesita personas reales del servidor (con id), nunca invitados.
  const members = directory.members.filter((member) => (allowGuests || !String(member.id || '').startsWith('custom-'))
    && (!memberFilter || memberFilter(member)));

  const handleToggle = (tag) => {
    if (singleSelect) {
      onSelectionChange([tag]);
      return;
    }

    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;

    const isCurrentlySelected =
      selectedKeys.has(cleanTag) ||
      selectedKeys.has(cleanTag.replace(/^@/, '')) ||
      Array.from(selectedKeys).some(
        (k) =>
          k.toLowerCase() === cleanTag.toLowerCase() ||
          `@${k.toLowerCase()}` === cleanTag.toLowerCase()
      );

    const nextKeys = new Set(
      Array.from(selectedKeys).map((k) => (k.startsWith('@') ? k : `@${k}`))
    );

    if (isCurrentlySelected) {
      nextKeys.delete(cleanTag);
      nextKeys.delete(cleanTag.replace(/^@/, ''));
      for (const k of Array.from(nextKeys)) {
        if (
          k.toLowerCase() === cleanTag.toLowerCase() ||
          `@${k.toLowerCase()}` === cleanTag.toLowerCase()
        ) {
          nextKeys.delete(k);
        }
      }
    } else {
      nextKeys.add(cleanTag);
    }
    onSelectionChange(Array.from(nextKeys));
  };

  const handleAddGuest = (name) => {
    const rawName = name.trim().replace(/^@/, '');
    if (!rawName) return;
    const cleanTag = `@${rawName}`;

    saveCustomParticipant({
      id: `custom-${Date.now().toString(36)}`,
      type: 'user',
      globalName: rawName,
      username: rawName.toLowerCase().replace(/\s+/g, '.'),
      tag: cleanTag,
      avatarColor:
        DISCORD_PALETTES[
          Math.abs(
            rawName
              .split('')
              .reduce((acc, c) => acc + c.charCodeAt(0), 0)
          ) % DISCORD_PALETTES.length
        ],
    });

    if (singleSelect) {
      onSelectionChange([cleanTag]);
    } else {
      const nextKeys = new Set(selectedKeys);
      nextKeys.add(cleanTag);
      onSelectionChange(Array.from(nextKeys));
    }
    onAddCustomParticipant?.(cleanTag);
    setSearchValue('');
  };

  const hasExactMatch = [...roles, ...members].some(
    (e) =>
      e.tag.toLowerCase() === `@${searchValue.trim()}`.toLowerCase() ||
      e.tag.toLowerCase() === searchValue.trim().toLowerCase() ||
      (e.globalName || e.name || '').toLowerCase() === searchValue.trim().toLowerCase()
  );

  // Start the keyboard highlight on the current choice instead of the first
  // row, so the highlight never reads as a second selection.
  const selectedMember = singleSelect
    ? members.find((member) => {
        const key = Array.from(selectedKeys)[0]?.replace(/^@/, '').toLowerCase();
        return key && (member.globalName.toLowerCase() === key || member.tag.toLowerCase() === `@${key}`);
      })
    : null;
  const memberItemValue = (member) => `${member.globalName} ${member.username} ${member.tag}`;

  return (
    <Command className="w-[300px] p-1" defaultValue={selectedMember ? memberItemValue(selectedMember) : undefined}>
      <CommandInput
        value={searchValue}
        onValueChange={setSearchValue}
        placeholder={placeholder || (hideRoles ? 'Buscar persona…' : 'Buscar persona o rol…')}
        className="text-xs"
      />

      {allowGuests && searchValue.trim() && !hasExactMatch && (
        <div className="px-1 py-1 border-b border-border/40">
          <button
            type="button"
            onClick={() => handleAddGuest(searchValue)}
            className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">
              Agregar a «<strong>{searchValue.trim()}</strong>»
            </span>
          </button>
        </div>
      )}

      <DirectoryStatus directory={directory} />
      <CommandList className="max-h-64 mt-1">
        <CommandEmpty>No hay resultados para esta búsqueda.</CommandEmpty>

        {onClear && selectedKeys.size > 0 && !searchValue.trim() && (
          <CommandGroup>
            <CommandItem value="__clear__" onSelect={onClear} className="cursor-pointer text-muted-foreground">
              <XIcon className="size-3.5 shrink-0" />
              <span className="text-xs font-medium">{clearLabel}</span>
            </CommandItem>
          </CommandGroup>
        )}

        {!hideRoles && roles.length > 0 && (
          <CommandGroup heading="Roles del servidor">
            {roles.map((role) => {
              const isSelected =
                selectedKeys.has(role.tag) ||
                selectedKeys.has(role.name) ||
                selectedKeys.has(`@${role.name}`) ||
                Array.from(selectedKeys).some(
                  (k) =>
                    k.toLowerCase() === role.tag.toLowerCase() ||
                    k.toLowerCase() === `@${role.name.toLowerCase()}`
                );

              return (
                <CommandItem
                  key={role.tag}
                  value={`${role.name} ${role.tag}`}
                  onSelect={() => handleToggle(role.tag)}
                  data-checked={isSelected}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="size-4 rounded-md text-[10px] font-bold flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: role.color }}
                    >
                      #
                    </span>
                    <span className="text-xs font-medium text-foreground truncate">
                      {role.name}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">
                      {roleHint(role)}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!hideRoles && roles.length > 0 && members.length > 0 && <CommandSeparator />}

        {members.length > 0 && (
          <CommandGroup heading={`${hasCompleteDirectory() ? 'Personas del canal' : 'Personas del servidor'}${allowGuests ? ' e invitados' : ''}`}>
            {members.map((member) => {
              const isSelected =
                selectedKeys.has(member.tag) ||
                selectedKeys.has(member.globalName) ||
                selectedKeys.has(`@${member.globalName}`) ||
                Array.from(selectedKeys).some(
                  (k) =>
                    k.toLowerCase() === member.tag.toLowerCase() ||
                    k.toLowerCase() === `@${member.globalName.toLowerCase()}` ||
                    k.toLowerCase() === member.globalName.toLowerCase()
                );

              return (
                <CommandItem
                  key={member.id}
                  value={memberItemValue(member)}
                  onSelect={() => (onSelectMember ? onSelectMember(member) : handleToggle(singleSelect ? member.globalName : member.tag))}
                  data-checked={isSelected}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Avatar
                      size="xs"
                      className="size-5 text-[9px] font-bold shrink-0 shadow-2xs"
                      style={{
                        backgroundColor: `${member.avatarColor}30`,
                        color: member.avatarColor,
                      }}
                    >
                      {member.avatar && <AvatarImage src={member.avatar} alt="" />}
                          <AvatarFallback style={{ backgroundColor: `${member.avatarColor}30`, color: member.avatarColor }}>
                        {member.globalName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-foreground truncate">
                      {member.globalName}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">
                      {member.inCall ? 'En la actividad' : member.tag}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/**
 * One person (meeting or topic facilitator). Picking closes the menu right
 * away, which is what makes it read as single-choice; "Quitar" clears it.
 */
export function SinglePersonPicker({
  value = '',
  onChange,
  renderTrigger,
  clearLabel = 'Quitar a quien facilita',
  align = 'start',
}) {
  const [open, setOpen] = useState(false);
  const selectedKeys = value ? new Set([value]) : new Set();
  const pick = (name) => {
    onChange?.(name);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderTrigger({open})} />
      <PopoverContent align={align} className="p-0 w-auto overflow-hidden">
        <SearchableParticipantMenu
          singleSelect
          hideRoles
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => pick(keys[0] ? keys[0].replace(/^@/, '') : '')}
          onClear={value ? () => pick('') : undefined}
          clearLabel={clearLabel}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * One or more people (meeting facilitators), stored as "Ana, Pedro". The menu
 * stays open to pick several; "Quitar" clears them all.
 */
export function MultiPersonPicker({
  value = '',
  onChange,
  renderTrigger,
  clearLabel = 'Quitar a quienes facilitan',
  align = 'start',
}) {
  const [open, setOpen] = useState(false);
  const names = splitPeople(value);
  const selectedKeys = new Set(names.map((name) => `@${name}`));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderTrigger({open})} />
      <PopoverContent align={align} className="p-0 w-auto overflow-hidden">
        <SearchableParticipantMenu
          hideRoles
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => onChange?.(keys.map((key) => key.replace(/^@/, '')).join(', '))}
          onClear={names.length ? () => { onChange?.(''); setOpen(false); } : undefined}
          clearLabel={clearLabel}
          placeholder="Buscar persona…"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Una persona del servidor con su id de Discord (responsable de una tarea).
 * Sin invitados: el aviso y el MD necesitan a alguien real del canal.
 */
export function MemberIdPicker({
  value = null,
  onChange,
  renderTrigger,
  clearLabel = 'Quitar responsable',
  align = 'start',
}) {
  const [open, setOpen] = useState(false);
  const production = isProductionActivity();
  const pick = (member) => {
    onChange?.(member);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderTrigger({open})} />
      <PopoverContent align={align} className="p-0 w-auto overflow-hidden">
        <SearchableParticipantMenu
          singleSelect
          hideRoles
          allowGuests={false}
          memberFilter={(member) => !production || /^\d+$/.test(String(member.id || ''))}
          selectedKeys={value?.name ? new Set([value.name]) : new Set()}
          onSelectMember={(member) => pick({id: String(member.id), name: member.globalName || member.username || 'Miembro'})}
          onSelectionChange={() => {}}
          onClear={value ? () => pick(null) : undefined}
          clearLabel={clearLabel}
          placeholder="Buscar persona del servidor…"
        />
      </PopoverContent>
    </Popover>
  );
}
