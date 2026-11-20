// Enlaces bardo:// que abren la app en un canal o documento concreto.
import {ORIGIN, PROTOCOL} from './config.js';

const ID_PATTERN = /^[\w-]{1,64}$/;
const DOCUMENT_PATTERN = /^[\w:-]{1,128}$/;

/** bardo://open?guild=…&channel=…&document=… → la misma vista en la web. */
export function deepLinkTarget(raw, origin = ORIGIN) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:`) return null;
  const action = url.hostname || url.pathname.replace(/^\/+/, '');
  if (action !== 'open') return origin;
  const guild = url.searchParams.get('guild') || '';
  const channel = url.searchParams.get('channel') || '';
  const document = url.searchParams.get('document') || '';
  if (!ID_PATTERN.test(guild) || !ID_PATTERN.test(channel)) return origin;
  const target = new URL('/', origin);
  target.searchParams.set('guild', guild);
  target.searchParams.set('channel', channel);
  if (document && DOCUMENT_PATTERN.test(document)) target.searchParams.set('document', document);
  return target.toString();
}

