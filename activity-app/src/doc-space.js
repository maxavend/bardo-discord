/**
 * Espacios de documentos: los del canal (siguen sus reglas en Discord) y los
 * personales (de una persona, en cualquier servidor, con enlace opcional).
 * Reuniones y tareas siempre son del canal; esto solo aplica a documentos.
 */

export const SPACES = {
  channel: {id: 'channel', label: 'Este canal', hash: '#docs'},
  personal: {id: 'personal', label: 'Personal', hash: '#docs-personal'},
};

export const docSpace = doc => (doc?.space === 'personal' ? 'personal' : 'channel');
export const isPersonalDoc = doc => docSpace(doc) === 'personal';

/**
 * 'channel', 'owner', 'editor' o 'viewer'. Un personal sin rol es propio: así
 * llegan los creados en este dispositivo antes de que el servidor responda.
 */
export function docRole(doc) {
  if (!isPersonalDoc(doc)) return 'channel';
  return ['owner', 'editor', 'viewer'].includes(doc?.role) ? doc.role : 'owner';
}

export const canEditDoc = doc => docRole(doc) !== 'viewer';
/** Archivar, restaurar, eliminar y decidir el enlace. */
export const canManageDoc = doc => ['channel', 'owner'].includes(docRole(doc));
/** Compartido contigo: personal de otra persona, abierto por su enlace. */
export const isSharedWithMe = doc => isPersonalDoc(doc) && docRole(doc) !== 'owner';

export const libraryHashFor = doc => SPACES[docSpace(doc)].hash;

export const LINK_ACCESS = [
  {value: 'none', label: 'Solo tú', description: 'Nadie más puede abrirlo, aunque tenga el enlace.'},
  {value: 'read', label: 'Cualquiera con el enlace puede leer', description: 'Lo abre en el lector, sin poder cambiarlo.'},
  {value: 'edit', label: 'Cualquiera con el enlace puede editar', description: 'Puede leerlo y guardar cambios. Archivarlo sigue siendo solo tuyo.'},
];

export const linkAccessOf = doc => (['read', 'edit'].includes(doc?.linkAccess) ? doc.linkAccess : 'none');

/** Texto breve para la fila: de dónde es y qué puedes hacer. */
export function docSpaceNote(doc) {
  if (!isPersonalDoc(doc)) return '';
  const role = docRole(doc);
  if (role === 'viewer') return 'Compartido contigo · Solo lectura';
  if (role === 'editor') return 'Compartido contigo';
  return linkAccessOf(doc) === 'none' ? 'Solo tú' : 'Con enlace';
}

/** Documentos de un espacio (activos o archivados, según la lista que reciba). */
export function docsInSpace(docs, space) {
  return docs.filter(doc => docSpace(doc) === space);
}
