import test from 'node:test';
import assert from 'node:assert/strict';
import { allCommands } from '../scripts/command-definitions.js';
import { REU_DESCRIPTION_MAX, TITLE_MAX } from '../src/limits.js';

const byName = Object.fromEntries(allCommands.map(command => [command.name, command.toJSON()]));
const option = (command, name) => byName[command].options.find(item => item.name === name);

test('/reu-new limita la descripción para que la tarjeta no pueda ser rechazada', () => {
  assert.equal(option('reu-new', 'descripcion').max_length, REU_DESCRIPTION_MAX);
  assert.ok(REU_DESCRIPTION_MAX + TITLE_MAX + 400 < 4000);
  assert.equal(option('reu-new', 'titulo').max_length, TITLE_MAX);
  assert.equal(option('reu-new', 'duracion').min_value, 1);
});

test('los títulos opcionales de documentos también están limitados', () => {
  for (const command of ['doc-upload', 'upload-docs', 'doc-new']) {
    assert.equal(option(command, 'titulo').max_length, TITLE_MAX, command);
  }
});

test('se registran los ocho comandos esperados', () => {
  assert.deepEqual(Object.keys(byName).sort(), ['ayuda', 'bardo', 'doc-new', 'doc-upload', 'docs', 'reu-new', 'reus', 'upload-docs']);
});
