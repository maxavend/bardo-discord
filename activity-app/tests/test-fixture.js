export const testDocument = {
  id: 'stress-monster',
  title: 'Stress test · Documento monstruo de 30 secciones',
  description: 'Un documento deliberadamente enorme para llevar scroll, sticky y toolbar al límite.',
  origin: 'QA de producto',
  createdAt: '2026-08-24T12:00:00.000Z',
  updatedAt: '2026-08-24T12:00:00.000Z',
  body: Array.from({length: 30}, (_, index) => `<p>Sección ${index + 1}: Documento de validación cargado con contenido heterogéneo para probar scroll, sticky, selección, guardado y renderizado.</p>`).join(''),
};

export function seedLocalDocument(page) {
  return page.evaluate(documentData => {
    localStorage.clear();
    localStorage.setItem('bardo.docs.heroui.v1', JSON.stringify({
      version: 1,
      docs: [documentData],
      deletedIds: [],
    }));
  }, testDocument);
}
