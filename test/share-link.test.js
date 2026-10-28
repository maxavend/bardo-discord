import test from 'node:test';
import assert from 'node:assert/strict';
import { shareBardoLink } from '../activity-app/src/share-link.js';

function fakeSdk(result) {
  const calls = [];
  return {
    calls,
    commands: {
      async shareLink(args) {
        calls.push(args);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test('shareBardoLink: cada tipo abre su destino con el mismo custom_id de los botones «Abrir»', async () => {
  const sdk = fakeSdk({ success: true, didCopyLink: true, didSendMessage: false });
  assert.equal(await shareBardoLink('doc', { id: 'doc-1', title: 'Plan' }, { sdk }), 'copied');
  assert.equal(await shareBardoLink('meeting', { id: 'sess-1', title: 'Weekly' }, { sdk }), 'copied');
  assert.equal(await shareBardoLink('task', { id: 'card-1', title: 'Arreglar' }, { sdk }), 'copied');
  assert.deepEqual(sdk.calls.map(call => call.custom_id), [
    'bardo:open:doc-1',
    'bardo:open:planner-session:sess-1',
    'bardo:open:kanban-card:card-1',
  ]);
  assert.equal(sdk.calls[1].message, 'Te comparto la reunión «Weekly» en Bardo.');
});

test('shareBardoLink: enviado, cancelado, error y fuera de Discord', async () => {
  assert.equal(await shareBardoLink('doc', { id: 'd', title: 'T' }, { sdk: fakeSdk({ success: true, didCopyLink: false, didSendMessage: true }) }), 'sent');
  assert.equal(await shareBardoLink('doc', { id: 'd', title: 'T' }, { sdk: fakeSdk({ success: false, didCopyLink: false, didSendMessage: false }) }), 'cancelled');
  assert.equal(await shareBardoLink('doc', { id: 'd', title: 'T' }, { sdk: fakeSdk(new Error('boom')) }), 'error');
  assert.equal(await shareBardoLink('doc', { id: 'd', title: 'T' }, { sdk: null }), 'unavailable');
  assert.equal(await shareBardoLink('doc', { id: '', title: 'T' }, { sdk: fakeSdk({ success: true }) }), 'error');
});

test('shareBardoLink: un título larguísimo se acorta en el mensaje', async () => {
  const sdk = fakeSdk({ success: true, didCopyLink: true, didSendMessage: false });
  await shareBardoLink('doc', { id: 'd', title: `${'Muy '.repeat(40)}largo` }, { sdk });
  const quoted = sdk.calls[0].message.match(/«(.+)»/)[1];
  assert.ok(quoted.length <= 80);
  assert.ok(quoted.endsWith('…'));
});
