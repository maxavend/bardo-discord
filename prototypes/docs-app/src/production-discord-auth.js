import {DiscordSDK} from '@discord/embedded-app-sdk';
import {installBardoApiSession} from './production-launch-auth.js';

const FALLBACK_CLIENT_ID = '1539704001535156254';

function resolveClientId() {
  const host = window.location.hostname || '';
  const match = host.match(/^([a-zA-Z0-9_-]+)\.discordsays\.com$/i);
  return match?.[1] || FALLBACK_CLIENT_ID;
}

function launchCustomId(sdk) {
  const params = new URLSearchParams(window.location.search);
  return sdk?.customId
    || params.get('custom_id')
    || params.get('document')
    || params.get('id')
    || null;
}

function isEmbeddedActivity() {
  const params = new URLSearchParams(window.location.search);
  return params.has('instance_id') || /\.discordsays\.com$/i.test(window.location.hostname || '');
}

export async function authenticateBardoDiscord() {
  if (!isEmbeddedActivity()) {
    return {embedded:false, ready:true, sdk:null, guildId:null, user:null};
  }

  try {
    const sdk = new DiscordSDK(resolveClientId());
    await sdk.ready();

    const guildId = sdk.guildId || null;
    if (!guildId) {
      return {
        embedded:true,
        ready:false,
        sdk,
        guildId:null,
        user:null,
        message:'Bardo Docs se abre desde un servidor de Discord para respetar los documentos compartidos de ese servidor.',
      };
    }

    const {code} = await sdk.commands.authorize({
      client_id: resolveClientId(),
      response_type:'code',
      state:'',
      prompt:'none',
      scope:['identify', 'guilds'],
    });

    const tokenResponse = await fetch('/api/auth/token', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Accept':'application/json'},
      body:JSON.stringify({code, guildId}),
      cache:'no-store',
    });
    const tokenPayload = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenPayload?.access_token || !tokenPayload?.bardo_token) {
      const message = tokenPayload?.error || `Discord auth HTTP ${tokenResponse.status}`;
      throw new Error(message);
    }

    const auth = await sdk.commands.authenticate({access_token:tokenPayload.access_token});
    if (!auth?.user?.id) throw new Error('Discord authenticate no devolvió un usuario.');
    if (tokenPayload.user?.id && tokenPayload.user.id !== auth.user.id) {
      throw new Error('La identidad autenticada por Discord no coincide con la sesión de Bardo.');
    }

    const customId = launchCustomId(sdk);
    installBardoApiSession({token:tokenPayload.bardo_token, customId});

    window.__BARDO_PRODUCTION__ = true;
    window.__BARDO_DISCORD_SDK__ = sdk;
    window.__BARDO_SESSION_TOKEN__ = tokenPayload.bardo_token;
    window.__BARDO_GUILD_ID__ = guildId;
    window.__BARDO_USER__ = auth.user;
    window.__BARDO_CUSTOM_ID__ = customId;
    window.__BARDO_INSTANCE_ID__ = sdk.instanceId || new URLSearchParams(window.location.search).get('instance_id') || null;

    return {
      embedded:true,
      ready:true,
      sdk,
      guildId,
      user:auth.user,
      customId,
    };
  } catch (error) {
    console.error('Bardo Docs: autenticación Discord falló', error);
    return {
      embedded:true,
      ready:false,
      sdk:null,
      guildId:null,
      user:null,
      message:'No pudimos autenticar tu sesión de Discord. Cierra esta vista y vuelve a abrir el documento.',
      error,
    };
  }
}
