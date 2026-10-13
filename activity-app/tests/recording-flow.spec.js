import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

// Real MediaRecorder/IndexedDB/playback; only the microphone signal is synthetic.
// These flags never open the user's microphone.
test.use({
  launchOptions: {args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']},
  permissions: ['microphone'],
});

async function startMeeting(page) {
  await page.goto('/?theme=dark#planner');
  await page.getByRole('button', {name: 'Nueva reunión'}).last().click();
  await page.getByRole('button', {name: 'Listo', exact: true}).click();
  await page.getByRole('button', {name: 'Iniciar reunión'}).first().click();
}

test('audio real: pausa, guardado, reproducción, recarga y descarga conservan el archivo', async ({page}) => {
  await startMeeting(page);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await original(options);
      window.__qaRecordingTracks = stream.getTracks();
      return stream;
    };
  });
  await page.getByRole('button', {name: 'Grabar', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Pausar grabación'})).toBeVisible();
  // Give the actual encoder time to emit at least one timeslice.
  await page.waitForTimeout(1500);
  await page.getByRole('button', {name: 'Pausar grabación'}).click();
  await page.getByRole('button', {name: 'Reanudar grabación'}).click();
  await page.waitForTimeout(1100);
  await page.getByRole('button', {name: 'Detener y guardar grabación'}).click();
  const dialog = page.getByRole('dialog', {name: 'Grabación finalizada'});
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__qaRecordingTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await dialog.getByLabel('Nombre de la grabación').fill('Audio verificable');
  await dialog.getByRole('button', {name: 'Guardar grabación'}).click();
  await page.getByRole('button', {name: 'Más acciones de la reunión'}).click();
  await page.getByRole('menuitem', {name: 'Terminar reunión'}).click();
  await page.getByRole('dialog', {name: '¿Terminar la reunión?'}).getByRole('button', {name: 'Terminar reunión'}).click();
  await expect(page).toHaveURL(/#planner-recap$/);
  await page.getByRole('button', {name: 'Reproducir audio'}).first().click();
  await expect.poll(() => page.locator('audio').first().evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
  await page.reload();
  await expect(page).toHaveURL(/#planner-recap$/);
  await page.getByRole('button', {name: 'Reproducir audio'}).first().click();
  await expect.poll(() => page.locator('audio').first().evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
  const binary = await page.locator('audio').first().evaluate(async audio => [...new Uint8Array(await (await fetch(audio.src)).arrayBuffer())]);
  await page.getByRole('button', {name: 'Opciones de la grabación'}).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', {name: 'Descargar audio', exact: true}).click();
  const download = await downloadPromise;
  const file = await readFile(await download.path());
  expect(file.length).toBeGreaterThan(1000);
  expect([...file]).toEqual(binary);
});

test('un permiso denegado muestra recuperación y permite reintentar', async ({page}) => {
  await startMeeting(page);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__allowQaMicrophone = () => { navigator.mediaDevices.getUserMedia = original; };
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.getByRole('button', {name: 'Grabar', exact: true}).click();
  await expect(page.getByText(/Bardo no tiene permiso para usar tu micrófono/)).toBeVisible();
  await expect(page.getByRole('button', {name: 'Grabar', exact: true})).toBeEnabled();
  await page.evaluate(() => window.__allowQaMicrophone());
  await page.getByRole('button', {name: 'Grabar', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Detener y guardar grabación'})).toBeVisible();
  await page.getByRole('button', {name: 'Detener y guardar grabación'}).click();
});
