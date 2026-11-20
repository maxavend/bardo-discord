// Pruebas de las partes de la app que no necesitan Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {resolveOrigin, isExternalWebUrl} from '../src/main/config.js';
import {deepLinkTarget} from '../src/main/links.js';
import {createPkce, startLoopbackAuthorization} from '../src/main/oauth.js';
import {createHash} from 'node:crypto';

const ORIGIN = 'https://bardo.test';

test('el origen solo puede ser https o loopback', () => {
  assert.equal(resolveOrigin('https://bardo.test/algo'), 'https://bardo.test');
  assert.equal(resolveOrigin('http://localhost:8787'), 'http://localhost:8787');
  assert.throws(() => resolveOrigin('http://bardo.test'));
  assert.throws(() => resolveOrigin('file:///etc/passwd'));
  assert.equal(isExternalWebUrl('javascript:alert(1)'), false);
  assert.equal(isExternalWebUrl('https://discord.com'), true);
});

test('los enlaces bardo:// solo abren canales y documentos válidos de Bardo', () => {
  assert.equal(
    deepLinkTarget('bardo://open?guild=g1&channel=c1&document=doc-1', ORIGIN),
    'https://bardo.test/?guild=g1&channel=c1&document=doc-1',
  );
  assert.equal(deepLinkTarget('bardo://open?guild=../x&channel=c1', ORIGIN), ORIGIN);
  assert.equal(deepLinkTarget('bardo://otra-cosa', ORIGIN), ORIGIN);
  assert.equal(deepLinkTarget('https://evil.test', ORIGIN), null);
  assert.equal(
    deepLinkTarget('bardo://open?guild=g1&channel=c1&document=<script>', ORIGIN),
    'https://bardo.test/?guild=g1&channel=c1',
  );
});

test('PKCE usa S256 con un verificador válido', () => {
  const {verifier, challenge} = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
});

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({status: response.statusCode, body}));
    }).on('error', reject);
  });
}

test('la vuelta por loopback exige el state y entrega el código', async () => {
  let opened;
  const flow = startLoopbackAuthorization({
    origin: ORIGIN,
    clientId: 'bardo_desktop',
    scope: 'bardo:read bardo:app',
    openBrowser: async url => { opened = new URL(url); },
  });
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(opened.origin, ORIGIN);
  assert.equal(opened.pathname, '/oauth/authorize');
  assert.equal(opened.searchParams.get('code_challenge_method'), 'S256');
  const redirect = new URL(opened.searchParams.get('redirect_uri'));
  assert.equal(redirect.hostname, '127.0.0.1');

  const forged = await get(`${redirect}?code=robado&state=otro`);
  assert.equal(forged.status, 400);

  const state = opened.searchParams.get('state');
  const ok = await get(`${redirect}?code=bueno&state=${state}&iss=${encodeURIComponent(ORIGIN)}`);
  assert.equal(ok.status, 200);
  assert.match(ok.body, /volver a Bardo/);
  const result = await flow.promise;
  assert.equal(result.code, 'bueno');
  assert.equal(result.redirectUri, redirect.toString());
});

test('cancelar en el navegador termina el inicio de sesión con un error claro', async () => {
  let opened;
  const flow = startLoopbackAuthorization({
    origin: ORIGIN, clientId: 'bardo_desktop', scope: 'bardo:read',
    openBrowser: async url => { opened = new URL(url); },
  });
  while (!opened) await new Promise(resolve => setTimeout(resolve, 5));
  const redirect = opened.searchParams.get('redirect_uri');
  await get(`${redirect}?error=access_denied&state=${opened.searchParams.get('state')}`);
  await assert.rejects(flow.promise, error => error.code === 'cancelled');
});
