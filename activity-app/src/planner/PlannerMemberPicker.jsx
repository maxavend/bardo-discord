import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { ChevronDown } from 'lucide-react';
import { XIcon, PlusIcon } from '@/components/ui/animated-icons';
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

export function getSavedCustomParticipants() {
  try {
    const raw = localStorage.getItem('bardo_discord_custom_participants');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomParticipant(item) {
  try {
    const list = getSavedCustomParticipants();
    if (!list.some((existing) => existing.tag.toLowerCase() === item.tag.toLowerCase())) {
      const next = [...list, item];
      localStorage.setItem('bardo_discord_custom_participants', JSON.stringify(next));
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
    }));

    members = (channelContext.members || []).map((m, idx) => ({
      id: m.id,
      type: 'user',
      username: m.username,
      globalName: m.globalName || m.username,
      tag: m.tag || `@${m.globalName || m.username}`,
      avatar: m.avatar,
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
  placeholder = 'Buscar personas o roles...',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [entities, setEntities] = useState(() => getAllDiscordEntities());
  const _inputRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.__bardoChannelContext && window.__BARDO_PRODUCTION__) {
      fetch('/api/discord/channel-context', {
        headers: window.__BARDO_SESSION_TOKEN__ ? { Authorization: `Bearer ${window.__BARDO_SESSION_TOKEN__}` } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((ctx) => {
          if (ctx) {
            window.__bardoChannelContext = ctx;
            setEntities(getAllDiscordEntities());
          }
        })
        .catch(() => {});
    }
  }, []);

  const selectedTags = parseMentionsToArray(value);
  const selectedSet = new Set(selectedTags.map((t) => (t.startsWith('@') ? t : `@${t}`)));
  const { members, roles } = entities;

  const handleToggleTag = (tag) => {
    let cleanTag = tag.trim();
    if (!cleanTag.startsWith('@')) cleanTag = `@${cleanTag}`;

    if (singleSelect) {
      if (selectedSet.has(cleanTag)) {
        onChange('');
      } else {
        onChange(cleanTag);
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

                return (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1.5 py-1 px-2.5 rounded-xl border border-border/50 text-xs font-medium text-foreground shrink-0"
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveTag(tag, e)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm cursor-pointer ml-0.5"
                      aria-label={`Eliminar ${label}`}
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
            placeholder="Buscar..." 
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
                <PlusIcon className="size-3.5 shrink-0" />
                <span className="truncate">
                  Agregar invitado "<strong>{searchQuery.trim()}</strong>"
                </span>
              </button>
            </div>
          )}

          <CommandList className="max-h-64">
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>

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
                        <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">{role.tag}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!hideRoles && roles.length > 0 && members.length > 0 && <CommandSeparator />}

            {members.length > 0 && (
              <CommandGroup heading="Miembros del servidor y canal">
                {members.map((member) => {
                  const isSelected = selectedSet.has(member.tag);
                  return (
                    <CommandItem
                      key={member.tag}
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
                          <AvatarFallback style={{ backgroundColor: `${member.avatarColor}30`, color: member.avatarColor }}>
                            {member.globalName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-foreground truncate">{member.globalName}</span>
                        <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">{member.tag}</span>
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
}) {
  const [searchValue, setSearchValue] = useState('');
  const { members, roles } = getAllDiscordEntities();

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

    const nextKeys = new Set(selectedKeys);
    nextKeys.add(cleanTag);
    onSelectionChange(Array.from(nextKeys));
    onAddCustomParticipant?.(cleanTag);
    setSearchValue('');
  };

  const hasExactMatch = [...roles, ...members].some(
    (e) =>
      e.tag.toLowerCase() === `@${searchValue.trim()}`.toLowerCase() ||
      e.tag.toLowerCase() === searchValue.trim().toLowerCase() ||
      (e.globalName || e.name || '').toLowerCase() === searchValue.trim().toLowerCase()
  );

  return (
    <Command className="w-[300px] p-1">
      <CommandInput
        value={searchValue}
        onValueChange={setSearchValue}
        placeholder="Buscar miembro o rol..."
        className="text-xs"
      />

      {searchValue.trim() && !hasExactMatch && (
        <div className="px-1 py-1 border-b border-border/40">
          <button
            type="button"
            onClick={() => handleAddGuest(searchValue)}
            className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary hover:bg-accent flex items-center gap-2 transition-colors cursor-pointer"
          >
            <PlusIcon className="size-3.5 shrink-0" />
            <span className="truncate">
              Agregar "<strong>{searchValue.trim()}</strong>"
            </span>
          </button>
        </div>
      )}

      <CommandList className="max-h-64 mt-1">
        <CommandEmpty>No se encontraron resultados.</CommandEmpty>

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
                      {role.tag}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!hideRoles && roles.length > 0 && members.length > 0 && <CommandSeparator />}

        {members.length > 0 && (
          <CommandGroup heading="Miembros del servidor y canal">
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
                  key={member.tag}
                  value={`${member.globalName} ${member.username} ${member.tag}`}
                  onSelect={() => handleToggle(singleSelect ? member.globalName : member.tag)}
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
                      <AvatarFallback style={{ backgroundColor: `${member.avatarColor}30`, color: member.avatarColor }}>
                        {member.globalName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-foreground truncate">
                      {member.globalName}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground shrink-0 max-w-[45%] truncate text-right">
                      {member.tag}
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
