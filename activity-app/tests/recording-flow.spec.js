import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// A real WAV fixture represents audio saved by the previous release.
// No microphone or new recording is needed to test backwards compatibility.
function legacyAudio() {
  const samples = 8000;
  const file = Buffer.alloc(44 + samples * 2);
  file.write('RIFF'); file.writeUInt32LE(file.length - 8, 4); file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16); file.writeUInt16LE(1, 20); file.writeUInt16LE(1, 22);
  file.writeUInt32LE(8000, 24); file.writeUInt32LE(16000, 28);
  file.writeUInt16LE(2, 32); file.writeUInt16LE(16, 34); file.write('data', 36);
  file.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) file.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 8000) * 2000), 44 + i * 2);
  return [...file];
}

for (const unfinished of [false, true]) {
  test(`audio anterior ${unfinished ? 'interrumpido se recupera' : 'guardado se conserva'} y se descarga tras recargar`, async ({page}) => {
    await page.addInitScript(() => {
      window.__microphoneRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { window.__microphoneRequests++; throw Error('Unexpected microphone request'); };
    });
    await page.goto('/?theme=dark#planner');
    await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
    await page.getByRole('button', {name: 'Listo', exact: true}).click();
    await page.getByRole('button', {name: 'Iniciar reunión'}).first().click();
    const binary = legacyAudio();
    await page.evaluate(async ({binary, unfinished}) => {
      const liveKey = 'bardo-planner-live-session-v1';
      const live = JSON.parse(localStorage.getItem(liveKey));
      const planner = JSON.parse(localStorage.getItem('bardo-planner-session-state-v1'));
      const block = planner.blocks[0];
      const meta = {id: 'legacy-audio', name: 'Audio anterior', sessionId: live.sessionId,
        plannerSessionId: planner.id, blockId: block.id, blockTitle: block.title, pointId: 'removed-topic',
        mimeType: 'audio/wav', durationMs: 1000, startedAt: Date.now() - 1000,
        createdAt: Date.now(), timesliceMs: 1000, fileSize: binary.length,
        status: 'saved', binaryStorage: 'indexeddb'};
      const blob = new Blob([new Uint8Array(binary)], {type: meta.mimeType});
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('bardo-planner-recordings-v1', 2);
        request.onupgradeneeded = () => {
          for (const name of ['audio', 'chunks', 'inprogress']) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, {keyPath: name === 'chunks' ? 'key' : 'id'});
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['audio', 'chunks', 'inprogress'], 'readwrite');
          if (unfinished) {
            tx.objectStore('inprogress').put(meta);
            tx.objectStore('chunks').put({key: meta.id + ':00000000', recordingId: meta.id, seq: 0, blob});
          } else tx.objectStore('audio').put({id: meta.id, blob, savedAt: Date.now()});
          tx.oncomplete = () => {db.close(); resolve();};
          tx.onerror = () => reject(tx.error);
        };
      });
      localStorage.setItem(liveKey, JSON.stringify({...live, status: 'completed', recordings: unfinished ? [] : [meta]}));
    }, {binary, unfinished});
    await page.goto('/?theme=dark#planner-recap');
    await page.reload();
    await expect(page.getByRole('heading', {name: 'Grabaciones', exact: true})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Audios de temas anteriores'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Grabar', exact: true})).toHaveCount(0);
    // A second boot must retain recovered audio too, with no duplicate entries.
    await page.reload();
    await expect(page.getByRole('button', {name: 'Reproducir audio'})).toHaveCount(1);
    await expect(page.getByRole('button', {name: 'Reproducir audio'})).toBeEnabled();
    await page.getByRole('button', {name: 'Opciones de la grabación'}).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', {name: 'Descargar audio', exact: true}).click();
    const file = await readFile(await (await downloadPromise).path());
    expect([...file]).toEqual(binary);
    expect(await page.evaluate(() => window.__microphoneRequests)).toBe(0);
  });
}
