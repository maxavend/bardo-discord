import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentPayload, buildErrorPayload, buildNavigationRow } from '../src/components.js';

test('buildNavigationRow desactiva botón anterior en página 0', () => {
  const row = buildNavigationRow(0, 3);
  const json = row.toJSON();
  assert.equal(json.components.length, 3);
  assert.equal(json.components[0].disabled, true);
  assert.equal(json.components[1].label, '1 / 3');
  assert.equal(json.components[1].disabled, true);
  assert.equal(json.components[2].disabled, false);
});

test('buildNavigationRow desactiva botón siguiente en última página', () => {
  const row = buildNavigationRow(2, 3);
  const json = row.toJSON();
  assert.equal(json.components[0].disabled, false);
  assert.equal(json.components[1].label, '3 / 3');
  assert.equal(json.components[2].disabled, true);
});

test('buildDocumentPayload produce estructura de Components V2 válida', () => {
  const document = {
    title: 'Minuta Test',
    pages: ['Página 1 de contenido', 'Página 2 de contenido'],
  };

  const payload = buildDocumentPayload(document, 0);
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0].type, 17); // Container component type
});

test('buildErrorPayload produce contenedor con mensaje de error', () => {
  const payload = buildErrorPayload('Error de prueba');
  assert.ok(payload.flags !== undefined);
  assert.equal(payload.components.length, 1);
});
