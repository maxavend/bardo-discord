// Perfil en el header: tu avatar de Discord abre un menú con quién eres en
// este servidor, los ajustes por alcance y el tema. Reemplaza los botones
// sueltos de Ajustes y de tema.
import {useEffect, useState} from 'react';
import {Display, Hashtag, Moon, Person, Server, Sun} from '@gravity-ui/icons';
import {Avatar, AvatarFallback, AvatarImage} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {useTheme} from '@/lib/theme';
import {useWorkspace} from './workspace.js';

const THEMES = [
  {value: 'light', label: 'Claro', Icon: Sun},
  {value: 'dark', label: 'Oscuro', Icon: Moon},
  {value: 'system', label: 'Como el sistema', Icon: Display},
];

/**
 * Quién usa Bardo: el usuario de Discord y, si el contexto del canal ya
 * llegó, su avatar de este servidor y su rol más alto (sin @everyone).
 */
function readProfile() {
  const user = typeof window !== 'undefined' ? window.__BARDO_USER__ : null;
  if (!user?.id) return null;
  const context = window.__bardoChannelContext || {};
  const member = (context.members || []).find(item => String(item.id) === String(user.id));
  const memberRoles = new Set((member?.roles || []).map(String));
  // El contexto entrega los roles ordenados de mayor a menor posición.
  const role = (context.roles || []).find(item => memberRoles.has(String(item.id)) && item.name !== '@everyone') || null;
  const name = member?.globalName || user.global_name || user.username || 'Tú';
  return {
    name,
    username: user.username || null,
    avatar: member?.avatar || (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null),
    role: role ? {name: role.name, color: role.color || null} : null,
  };
}

function useProfile() {
  const [profile, setProfile] = useState(readProfile);
  useEffect(() => {
    // El contexto del canal puede llegar después del primer render.
    const update = () => setProfile(readProfile());
    window.addEventListener('bardo-home-status', update);
    return () => window.removeEventListener('bardo-home-status', update);
  }, []);
  return profile;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

function ProfileAvatar({profile, size}) {
  return (
    <Avatar size={size}>
      {profile?.avatar && <AvatarImage src={profile.avatar} alt="" />}
      <AvatarFallback>{profile ? initials(profile.name) : <Person aria-hidden="true" />}</AvatarFallback>
    </Avatar>
  );
}

function SettingsItem({Icon, title, description, onSelect}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="items-start py-2.5">
      <Icon aria-hidden="true" className="mt-0.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{title}</span>
        <span className="text-xs font-normal text-muted-foreground">{description}</span>
      </span>
    </DropdownMenuItem>
  );
}

export function UserMenu({onOpenSettings}) {
  const profile = useProfile();
  const {channelName} = useWorkspace();
  const {theme, setTheme} = useTheme('dark');
  const current = THEMES.find(item => item.value === theme) || THEMES[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="user-menu-trigger" aria-label={profile ? `Tu perfil y ajustes, ${profile.name}` : 'Ajustes'}>
          <ProfileAvatar profile={profile} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="user-menu-profile">
          <ProfileAvatar profile={profile} size="lg" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="user-menu-name">{profile ? profile.name : 'Sin cuenta de Discord'}</span>
            <span className="user-menu-meta">
              {profile
                ? <>{profile.username && <span>@{profile.username}</span>}{profile.role && <span className="user-menu-role" style={profile.role.color ? {'--role-color': profile.role.color} : undefined}>{profile.role.name}</span>}</>
                : 'Tus cambios quedan en este dispositivo.'}
            </span>
          </span>
        </DropdownMenuLabel>
        {onOpenSettings && <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Ajustes</DropdownMenuLabel>
            <SettingsItem Icon={Person} title="Tus preferencias" description="Al abrir Bardo y tus avisos" onSelect={() => onOpenSettings('personal')} />
            <SettingsItem Icon={Hashtag} title="Este canal" description={channelName ? `Nombre y avisos de #${channelName}` : 'Nombre y avisos del espacio'} onSelect={() => onOpenSettings('space')} />
            <SettingsItem Icon={Server} title="Todo el servidor" description="Valores para los canales sin ajuste propio" onSelect={() => onOpenSettings('server')} />
          </DropdownMenuGroup>
        </>}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <current.Icon aria-hidden="true" className="text-muted-foreground" />
            <span className="flex-1">Tema</span>
            <span className="text-xs font-normal text-muted-foreground">{current.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
              {THEMES.map(({value, label, Icon}) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon aria-hidden="true" className="text-muted-foreground" />{label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
