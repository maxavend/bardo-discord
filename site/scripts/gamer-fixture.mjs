// Landing-only fiction. Keep Activity code and the portfolio's original data intact.
import {buildSeed} from '../../portfolio/mock/build-seed.mjs';
import {markdownToHtml} from '../../activity-app/src/editor/bardo-markdown.js';
import demo from '../src/lib/demo-data.json' with {type: 'json'};
export {demo};
const aliases = [
  ['Sofía Herrera', 'sofia.herrera', demo.members.samus.name],
  ['Tomás Fuentes', 'tomas.fuentes', demo.members.zelda.name],
  ['Camila Rivas', 'camila.rivas', demo.members.link.name],
  ['Diego Morales', 'diego.morales', demo.members.misty.name],
  ['Josefina Lagos', 'josefina.lagos', demo.members.daenerys.name],
  ['Andrés Muñoz', 'andres.munoz', demo.members.mario.name],
  ['Ignacia Vera', 'ignacia.vera', demo.members.oak.name],
  ['Benjamín Soto', 'benjamin.soto', demo.members.kirby.name],
];
function rename(value) {
  if (typeof value === 'string') {
    for (const [name, username, character] of aliases) value = value.replaceAll(name, character).replaceAll(username, character.toLowerCase().replaceAll(' ', '.'));
    return value;
  }
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rename(item)]));
  return value;
}
const documentTitles = ['Guía de expedición · Hyrule', 'Plan de entrenamiento · Liga Pokémon', 'Bitácora de Zebes', 'Manual de pociones · Hyrule', 'Mapa del Reino Champiñón', 'Diario de aventuras · Dream Land', 'Preparativos de la Liga Pokémon', 'Archivo de misiones completadas', 'Atlas de Kanto'];
const taskTitles = [
  'Encontrar la Espada Maestra en el Bosque Perdido', 'Preparar pociones para el Templo del Agua',
  'Registrar a Pikachu en la Pokédex', 'Traducir las runas del Templo del Tiempo',
  'Reclutar entrenadores para la Liga Pokémon', 'Explorar la ruta secreta de Zebes',
  'Mejorar el traje de Samus con el Rayo Hielo', 'Localizar a Snorlax en la Ruta 12',
  'Diseñar el mapa del Reino Champiñón', 'Revisar el manual de vuelo de Charizard',
  'Organizar el inventario de bayas', 'Reunir las insignias de Kanto',
  'Abrir el portal al Templo del Tiempo', 'Rescatar a los Waddle Dees',
  'Recuperar las estrellas del castillo', 'Completar la expedición al Bosque Verde',
];
function meetingTheme(meeting) {
  meeting.title = demo.meeting;
  meeting.description = 'Rutas por Hyrule, entrenamiento Pokémon y próximas misiones en Zebes.';
  const titles = ['Preparativos de la expedición', demo.block, 'Expedición Pokémon', 'Próximas misiones'];
  const topics = [['Elegir el equipo de aventureros', 'Revisar el mapa de Hyrule'], demo.points.map(point => point.title), ['Pokémon vistos en el Bosque Verde', 'Pociones y Poké Balls para la ruta'], ['Repartir las misiones del equipo']];
  meeting.blocks?.forEach((block, index) => {
    block.title = titles[index % titles.length];
    block.introDesc = 'Acordar la ruta, repartir el inventario y volver con todo el equipo.';
    block.participants = 'Todo el escuadrón';
    block.subpoints?.forEach((point, i) => { point.title = topics[index % topics.length][i % topics[index % topics.length].length]; });
    block.decisions = [];
  });
  return meeting;
}
export function buildGamerSeed({theme = 'dark'} = {}) {
  const seed = rename(buildSeed({theme}));
  seed.storage['bardo.workspace.name.v1'] = demo.workspace;
  seed.globals.__bardoChannelContext.channelName = 'sala-de-misiones';
  seed.globals.__bardoChannelContext.guildName = 'Multiverso Bardo';
  seed.globals.__bardoChannelContext.members.forEach((member, index) => { member.role = ['Exploración', 'Estrategia', 'Entrenamiento'][index % 3]; });
  seed.globals.__bardoChannelContext.roles.forEach((role, index) => { role.name = ['Exploración', 'Estrategia', 'Entrenamiento'][index % 3]; });
  const docs = seed.storage['bardo.docs.heroui.v1'].docs;
  docs.forEach((doc, index) => {
    doc.title = documentTitles[index % documentTitles.length];
    doc.description = 'Mapas, inventario y acuerdos para la siguiente aventura del escuadrón.';
    if (doc.sourceName) doc.sourceName = `expedicion-${index + 1}.md`;
    const markdown = `## Antes de salir\n\n- Revisar el mapa con Zelda Hyrule.\n- Llevar pociones, Poké Balls y una cuerda.\n- Confirmar la ruta con Samus Aran.\n\n## Misiones del equipo\n\n| Misión | Responsable | Estado |\n| --- | --- | --- |\n| Encontrar la Espada Maestra | Link de Hyrule | En curso |\n| Entrenar a Charizard | Daenerys Targaryen | Por hacer |\n| Completar la Pokédex de Kanto | Profesor Oak | En revisión |\n\n## Acuerdos\n\n- [x] Reunir al equipo en el Templo del Tiempo.\n- [ ] Preparar el inventario para el Bosque Verde.\n- [ ] Compartir el mapa de Zebes en el canal.`;
    if (doc.id === 'doc-spec-kyc') doc.title = 'Plan de aventura · Hyrule y Kanto';
    doc.body = markdownToHtml(markdown, doc.title);
  });
  const board = seed.storage['bardo.kanban.board.v1'];
  board.board.tags.forEach((tag, i) => { tag.name = ['Hyrule', 'Pokémon', 'Metroid', 'Dragones', 'Exploración', 'Jefe final', 'Multijugador'][i]; });
  Object.values(board.cards).forEach((card, index) => {
    card.title = taskTitles[index % taskTitles.length];
    card.description = 'Misión ficticia del Escuadrón Hyrule. Coordina la ruta y comparte los hallazgos en el canal.';
    card.subtasks?.forEach((task, i) => { task.text = ['Preparar el inventario', 'Marcar la ruta en el mapa', 'Avisar al escuadrón'][i % 3]; });
  });
  meetingTheme(seed.storage['bardo-planner-session-state-v1']);
  seed.globals.__bardoChannelSessions.forEach(meetingTheme);
  return seed;
}
