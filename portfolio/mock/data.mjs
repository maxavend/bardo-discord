// Datos ficticios para el material de portafolio de Bardo.
//
// Escenario: Lumen, una fintech chilena para trabajadores independientes
// (boletas de honorarios, cobros y ahorro para impuestos). Su squad de
// Onboarding usa Bardo en el canal #producto de su servidor de Discord.
// Personas, empresa y cifras son inventadas; las fechas giran en torno al
// lunes 19 de octubre de 2026 (America/Santiago).

export const NOW_ISO = '2026-10-19T09:40:00-03:00';
export const TIME_ZONE = 'America/Santiago';

export const WORKSPACE_NAME = 'Squad Onboarding';
export const CHANNEL = {channelName: 'producto', guildName: 'Lumen'};

export const MEMBERS = [
  {id: 'u-sofia', username: 'sofia.herrera', globalName: 'Sofía Herrera', role: 'Product Designer'},
  {id: 'u-tomas', username: 'tomas.fuentes', globalName: 'Tomás Fuentes', role: 'Product Manager'},
  {id: 'u-camila', username: 'camila.rivas', globalName: 'Camila Rivas', role: 'UX Researcher'},
  {id: 'u-diego', username: 'diego.morales', globalName: 'Diego Morales', role: 'Frontend Engineer'},
  {id: 'u-josefina', username: 'josefina.lagos', globalName: 'Josefina Lagos', role: 'UX Writer'},
  {id: 'u-andres', username: 'andres.munoz', globalName: 'Andrés Muñoz', role: 'Tech Lead'},
  {id: 'u-ignacia', username: 'ignacia.vera', globalName: 'Ignacia Vera', role: 'Data Analyst'},
  {id: 'u-benjamin', username: 'benjamin.soto', globalName: 'Benjamín Soto', role: 'QA Engineer'},
];

export const ROLES = [
  {id: 'r-diseno', name: 'Diseño', color: '#9B59B6'},
  {id: 'r-producto', name: 'Producto', color: '#3498DB'},
  {id: 'r-ingenieria', name: 'Ingeniería', color: '#2ECC71'},
];

// Quien "usa" la app en las capturas.
export const CURRENT_USER = {id: 'u-sofia', username: 'sofia.herrera', global_name: 'Sofía Herrera', avatar: null};

const person = id => {
  const member = MEMBERS.find(item => item.id === id);
  return {id: member.id, name: member.globalName};
};

// ─────────────────────────────────────────────────────────────────────────────
// Documentos (Markdown → HTML canónico de Bardo en build-seed.mjs)

export const DOCS = [
  {
    id: 'doc-brief-onboarding',
    title: 'Brief · Onboarding v3',
    description: 'Por qué rediseñamos el registro, qué vamos a medir y qué queda fuera de este ciclo.',
    origin: 'Creado en Bardo',
    createdByName: 'Tomás Fuentes',
    updatedByName: 'Sofía Herrera',
    createdAt: '2026-09-28T13:10:00.000Z',
    updatedAt: '2026-10-19T12:22:00.000Z',
    markdown: `## Contexto

Hoy **38 %** de las personas que descargan Lumen termina el registro y emite su primera boleta de honorarios dentro de los primeros 7 días. El mayor abandono ocurre en la verificación de identidad: 1 de cada 3 personas sale de la app en ese paso.

> [!NOTE]
> Este brief resume lo acordado en la Weekly del 5 de octubre. Los hallazgos completos están en «Hallazgos · Entrevistas a independientes».

## Objetivo

Que más independientes lleguen a su primera boleta sin ayuda de soporte.

| Métrica | Hoy | Meta Q4 |
| --- | --- | --- |
| Registro completo (7 días) | 38 % | 50 % |
| Tiempo hasta la primera boleta | 2,4 días | menos de 1 día |
| Tickets de soporte en el registro | 410 / mes | 250 / mes |

## Alcance

- Nuevo paso de verificación de identidad con escaneo de cédula y prueba de vida.
- Conexión con el SII en un solo paso, con explicación de por qué la pedimos.
- Estado de progreso visible y posibilidad de retomar el registro más tarde.
- Copy de errores revisado con el equipo de UX Writing.

## Fuera de alcance

- Cambios en el flujo de cuentas empresa.
- Registro desde la web (llega en Q1 2027).

## Riesgos

1. El proveedor de verificación tiene una tasa de rechazo alta con cédulas antiguas.
2. La conexión con el SII depende de la disponibilidad de su servicio.
3. Cambiar el orden de los pasos afecta los eventos de analítica actuales.

## Equipo

- **Producto:** Tomás Fuentes
- **Diseño:** Sofía Herrera, Josefina Lagos
- **Research:** Camila Rivas
- **Ingeniería:** Andrés Muñoz, Diego Morales
- **Datos:** Ignacia Vera`,
  },
  {
    id: 'doc-hallazgos-entrevistas',
    title: 'Hallazgos · Entrevistas a independientes',
    description: '12 entrevistas a personas que emiten boletas de honorarios. Octubre 2026.',
    origin: 'Subido a Bardo',
    sourceName: 'sintesis-entrevistas-octubre.docx',
    createdByName: 'Camila Rivas',
    updatedByName: 'Camila Rivas',
    createdAt: '2026-10-16T21:05:00.000Z',
    updatedAt: '2026-10-16T21:40:00.000Z',
    markdown: `## Resumen

Entrevistamos a 12 personas independientes (diseño, salud, educación y oficios) entre el 6 y el 14 de octubre. Todas habían intentado registrarse en Lumen en los últimos 60 días; 7 no terminaron.

## Hallazgos principales

### 1. No entienden por qué pedimos la clave del SII

Ocho de doce personas dudaron al ver el campo. La mayoría lo asoció a un riesgo de fraude.

> «Si me piden la clave tributaria al tiro, pienso que es una estafa. Nadie me explicó para qué era.» — Participante 4, kinesióloga

### 2. La foto de la cédula falla y no dicen por qué

Cinco personas repitieron la foto más de tres veces. El mensaje «No pudimos validar tu documento» no les dio pistas sobre qué corregir.

### 3. Quieren terminar después

El registro toma en promedio 11 minutos. Varias personas lo empezaron en el transporte público y no encontraron cómo retomarlo.

## Frecuencia por problema

| Problema | Personas | Severidad |
| --- | --- | --- |
| Desconfianza al pedir la clave del SII | 8 / 12 | Alta |
| Errores de foto sin explicación | 5 / 12 | Alta |
| No poder retomar el registro | 6 / 12 | Media |
| Términos tributarios poco claros | 4 / 12 | Media |

## Oportunidades

- Explicar el beneficio antes de pedir la clave: «Así calculamos tu retención automáticamente».
- Guiar la foto en tiempo real (encuadre, reflejos, luz) en vez de validar al final.
- Guardar el progreso y avisar por notificación cuando falte un paso.

<details>
<summary>Perfil de participantes</summary>

- 5 personas de 25 a 34 años, 4 de 35 a 44, 3 de 45 o más.
- 7 usan iPhone y 5 Android.
- 9 emiten boletas todos los meses; 3, de forma ocasional.

</details>`,
  },
  {
    id: 'doc-spec-kyc',
    title: 'Especificación · Verificación de identidad',
    description: 'Flujo, estados y criterios de aceptación del nuevo paso de verificación (KYC).',
    origin: 'Creado en Bardo',
    createdByName: 'Sofía Herrera',
    updatedByName: 'Andrés Muñoz',
    createdAt: '2026-10-08T14:00:00.000Z',
    updatedAt: '2026-10-17T19:15:00.000Z',
    markdown: `## Flujo

1. Explicación breve de por qué verificamos la identidad.
2. Escaneo del anverso y reverso de la cédula, con guía de encuadre.
3. Prueba de vida: la persona gira la cabeza siguiendo una indicación.
4. Resultado: aprobado, en revisión o con un problema que se puede corregir.

## Estados y mensajes

| Estado | Mensaje | Acción principal |
| --- | --- | --- |
| Foto borrosa | Tu foto salió movida. Apoya el teléfono y vuelve a intentarlo. | Tomar otra foto |
| Reflejo | Hay un reflejo sobre tu cédula. Aléjate de la luz directa. | Tomar otra foto |
| Cédula vencida | Tu cédula venció. Necesitamos una vigente para continuar. | Ver alternativas |
| En revisión | Estamos revisando tus datos. Te avisaremos en menos de 24 horas. | Seguir explorando |

> [!NOTE]
> Los textos están en revisión con Josefina. No cerrar copy en Figma hasta la Weekly del 19 de octubre.

## Criterios de aceptación

- [x] El escaneo detecta automáticamente los bordes de la cédula.
- [x] Cada error explica qué pasó y cómo corregirlo.
- [ ] La persona puede salir y retomar desde el mismo paso.
- [ ] Lectores de pantalla anuncian el estado del escaneo.
- [ ] El flujo funciona con la letra del sistema al 200 %.

## Casos borde

- Personas extranjeras con cédula de residente.
- Cámara sin permiso: mostrar cómo activarlo en Ajustes del teléfono.
- Conexión lenta: subir las fotos en segundo plano y mostrar el progreso.`,
  },
  {
    id: 'doc-plan-usabilidad',
    title: 'Plan de prueba de usabilidad · Prototipo Onboarding',
    description: 'Seis sesiones moderadas remotas para validar el prototipo antes del desarrollo.',
    origin: 'Creado en Bardo',
    createdByName: 'Camila Rivas',
    updatedByName: 'Sofía Herrera',
    createdAt: '2026-10-12T15:30:00.000Z',
    updatedAt: '2026-10-18T22:05:00.000Z',
    markdown: `## Objetivo

Validar que una persona independiente pueda registrarse y emitir su primera boleta en el prototipo sin ayuda.

## Participantes

- 6 personas que nunca han usado Lumen.
- 3 con iPhone y 3 con Android.
- Sesiones de 45 minutos por videollamada, del 20 al 22 de octubre.

## Tareas

1. Crea tu cuenta y verifica tu identidad.
2. Conecta tu cuenta del SII.
3. Emite una boleta de $350.000 a «Estudio Pizarra SpA».
4. Sal de la app a mitad del registro y vuelve a entrar.

## Qué vamos a medir

| Indicador | Meta |
| --- | --- |
| Tareas completadas sin ayuda | 5 de 6 personas |
| Tiempo en la verificación | menos de 3 minutos |
| Facilidad percibida (SEQ) | 6 o más de 7 |

## Preparación

- [x] Prototipo en Figma con los tres estados de error.
- [x] Guion de la sesión revisado.
- [ ] Confirmar a las 6 personas participantes.
- [ ] Enviar consentimiento informado.`,
  },
  {
    id: 'doc-voz-tono',
    title: 'Guía de voz y tono · Lumen',
    description: 'Cómo hablamos con las personas independientes, con ejemplos para la app.',
    origin: 'Creado en Bardo',
    createdByName: 'Josefina Lagos',
    updatedByName: 'Josefina Lagos',
    createdAt: '2026-09-02T13:00:00.000Z',
    updatedAt: '2026-10-15T18:30:00.000Z',
    markdown: `## Principios

- **Claros antes que ingeniosos.** Si hay que elegir, gana la frase que se entiende a la primera.
- **Cercanos, no confianzudos.** Tuteamos, pero sin chilenismos que confundan.
- **Tranquilos con la plata.** Hablamos de impuestos sin alarmar ni culpar.

## Así sí, así no

| En vez de | Escribimos |
| --- | --- |
| Error 403: credenciales inválidas | Tu clave del SII no coincide. Revísala e inténtalo de nuevo. |
| Operación exitosa | Listo, tu boleta ya está emitida. |
| Debe completar todos los campos | Te falta tu RUT para continuar. |

## Palabras que usamos

- **Boleta** (no «documento tributario»).
- **Retención** con una explicación la primera vez que aparece.
- **Cobro** para lo que la persona recibe; **pago** para lo que hace.`,
  },
  {
    id: 'doc-roadmap-q4',
    title: 'Roadmap de producto · Q4 2026',
    description: 'Prioridades del trimestre para el squad de Onboarding.',
    origin: 'Creado en Bardo',
    createdByName: 'Tomás Fuentes',
    updatedByName: 'Tomás Fuentes',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-10-14T16:45:00.000Z',
    markdown: `## Prioridades

| Mes | Entrega | Estado |
| --- | --- | --- |
| Octubre | Prototipo y test de Onboarding v3 | En curso |
| Noviembre | Verificación de identidad en producción | Planificado |
| Noviembre | Retomar el registro donde quedó | Planificado |
| Diciembre | Conexión con el SII en un paso | En evaluación |

## Apuestas

1. **Registro sin fricción:** menos pasos y mejor explicados.
2. **Confianza:** mostrar seguridad y transparencia en cada dato que pedimos.
3. **Primera boleta guiada:** acompañar la primera emisión con ejemplos.

> [!NOTE]
> Revisamos este roadmap en la Sprint Planning de cada dos semanas.`,
  },
  {
    id: 'doc-checklist-a11y',
    title: 'Checklist de accesibilidad · Release 3.2',
    description: 'Revisión previa al release de la app móvil.',
    origin: 'Creado en Bardo',
    createdByName: 'Benjamín Soto',
    updatedByName: 'Benjamín Soto',
    createdAt: '2026-10-13T13:20:00.000Z',
    updatedAt: '2026-10-17T14:10:00.000Z',
    markdown: `## Pantallas revisadas

Inicio, Emitir boleta, Historial y Perfil.

## Checklist

- [x] Todos los botones tienen nombre accesible.
- [x] El orden de foco sigue el orden visual.
- [x] Los montos se leen completos («350 mil pesos»).
- [ ] Contraste de los chips de estado en modo oscuro.
- [ ] Mensajes de error asociados a su campo.
- [ ] Animaciones respetan «Reducir movimiento».

## Hallazgos abiertos

| Pantalla | Problema | Prioridad |
| --- | --- | --- |
| Historial | Chip «Pendiente» con contraste 2,9:1 | Urgente |
| Emitir boleta | El error del RUT no se anuncia | Alta |`,
  },
  {
    id: 'doc-acta-retro-23',
    title: 'Acta · Retro Sprint 23',
    description: 'Retrospectiva del 9 de octubre.',
    origin: 'Acta de reunión',
    createdByName: 'Tomás Fuentes',
    updatedByName: 'Tomás Fuentes',
    createdAt: '2026-10-09T21:00:00.000Z',
    updatedAt: '2026-10-09T21:00:00.000Z',
    markdown: `## Qué funcionó

- Las críticas de diseño cortas, de 45 minutos, con un objetivo por sesión.
- Tener el brief en Bardo, a un clic desde el canal.

## Qué mejorar

- Llegamos tarde a QA con dos historias por dependencias del proveedor.
- Faltó registrar los acuerdos de la Weekly en un lugar común.

## Acuerdos

- [x] Usar Bardo para el acta de cada Weekly. — Tomás
- [x] Pasar los acuerdos a Tareas al cerrar la reunión. — Sofía
- [ ] Revisar con el proveedor la tasa de rechazo de cédulas antiguas. — Andrés`,
  },
  {
    id: 'doc-benchmark-2025',
    title: 'Benchmark de apps de facturación (2025)',
    description: 'Comparativa del año pasado, reemplazada por los hallazgos de octubre.',
    origin: 'Subido a Bardo',
    sourceName: 'benchmark-facturacion-2025.pdf',
    createdByName: 'Camila Rivas',
    updatedByName: 'Camila Rivas',
    archived: true,
    archivedAt: '2026-10-10T15:00:00.000Z',
    createdAt: '2025-11-20T15:00:00.000Z',
    updatedAt: '2026-10-10T15:00:00.000Z',
    markdown: `## Apps revisadas

Cinco apps de facturación y cobro para independientes en Chile, México y Colombia.

## Conclusión

El registro promedio tomaba 9 pasos; las mejores lo resolvían en 5.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reuniones

const block = (id, title, minutes, {leader = '', participants = '', introDesc = '', points = [], decisions = [], phases} = {}) => ({
  id,
  type: 'block',
  title,
  durationMinutes: minutes,
  manualDuration: minutes,
  leader,
  participants,
  introDesc,
  phases: phases || {context: Math.max(1, Math.round(minutes * 0.15)), review: minutes - Math.max(1, Math.round(minutes * 0.15)) - Math.max(1, Math.round(minutes * 0.1)), closing: Math.max(1, Math.round(minutes * 0.1))},
  subpoints: points.map(([pointId, pointTitle, presenter, status = 'pending']) => ({id: pointId, title: pointTitle, presenter, status})),
  decisions: decisions.map(([decisionId, content, owner]) => ({id: decisionId, content, ...(owner ? {owner} : {})})),
});

const breakBlock = (id, minutes) => ({
  id,
  type: 'break',
  isBreak: true,
  title: 'Descanso',
  durationMinutes: minutes,
  manualDuration: minutes,
  leader: '',
  participants: '',
  introDesc: '',
  phases: {context: 0, review: minutes, closing: 0},
  subpoints: [],
  decisions: [],
});

const ALL_MENTIONS = MEMBERS.map(member => `@${member.globalName}`).join(' ');

export const WEEKLY_ID = 'sess-weekly-1019';

export const MEETINGS = [
  {
    id: WEEKLY_ID,
    status: 'scheduled',
    title: 'Weekly de producto',
    date: '2026-10-19',
    startTime: '10:00',
    targetDuration: 60,
    hostName: 'Tomás Fuentes',
    mentions: ALL_MENTIONS,
    description: 'Avance del Onboarding v3, hallazgos del test y métricas de activación.',
    updatedAt: '2026-10-19T12:20:00.000Z',
    blocks: [
      block('wk-b1', 'Check-in y prioridades de la semana', 10, {
        leader: 'Tomás Fuentes',
        participants: 'Todo el squad',
        introDesc: 'Cómo llegamos a la semana y qué no puede esperar.',
        points: [
          ['wk-p1', 'Estado del sprint 24', 'Tomás Fuentes'],
          ['wk-p2', 'Bloqueos y dependencias con el proveedor de verificación', 'Andrés Muñoz'],
        ],
      }),
      block('wk-b2', 'Onboarding v3: revisión del prototipo', 25, {
        leader: 'Sofía Herrera',
        participants: 'Diseño, Research y Producto',
        introDesc: 'Recorrer el prototipo navegable y decidir qué entra al test del miércoles.',
        points: [
          ['wk-p3', 'Paso de verificación de identidad', 'Sofía Herrera'],
          ['wk-p4', 'Explicación antes de pedir la clave del SII', 'Josefina Lagos'],
          ['wk-p5', 'Retomar el registro donde quedó', 'Sofía Herrera'],
        ],
      }),
      block('wk-b3', 'Métricas de activación', 15, {
        leader: 'Ignacia Vera',
        participants: 'Datos e Ingeniería',
        introDesc: 'Dónde se cae el embudo y qué eventos faltan para medir el nuevo flujo.',
        points: [
          ['wk-p6', 'Embudo de registro: caída en la verificación', 'Ignacia Vera'],
          ['wk-p7', 'Eventos para medir el nuevo flujo', 'Diego Morales'],
        ],
      }),
      block('wk-b4', 'Próximos pasos', 10, {
        leader: 'Tomás Fuentes',
        participants: 'Todo el squad',
        introDesc: 'Responsables y fechas antes de cerrar.',
        points: [
          ['wk-p8', 'Responsables y fechas de seguimiento', 'Todos'],
        ],
      }),
    ],
  },
  {
    id: 'sess-critica-pagos',
    status: 'scheduled',
    title: 'Crítica de diseño · Pagos recurrentes',
    date: '2026-10-21',
    startTime: '11:30',
    targetDuration: 45,
    hostName: 'Sofía Herrera',
    mentions: '@Sofía Herrera @Josefina Lagos @Camila Rivas @Tomás Fuentes @Diego Morales',
    description: 'Primera crítica de los flujos para programar cobros mensuales.',
    updatedAt: '2026-10-17T20:00:00.000Z',
    blocks: [
      block('cp-b1', 'Contexto y objetivo de la crítica', 5, {
        leader: 'Sofía Herrera',
        points: [['cp-p1', 'Qué problema resuelven los cobros recurrentes', 'Tomás Fuentes']],
      }),
      block('cp-b2', 'Recorrido de flujos', 30, {
        leader: 'Sofía Herrera',
        participants: 'Diseño y Producto',
        points: [
          ['cp-p2', 'Crear un cobro mensual a un cliente', 'Sofía Herrera'],
          ['cp-p3', 'Editar o pausar un cobro programado', 'Sofía Herrera'],
          ['cp-p4', 'Avisos antes de cada cobro', 'Josefina Lagos'],
        ],
      }),
      block('cp-b3', 'Feedback y acuerdos', 10, {
        leader: 'Camila Rivas',
        points: [['cp-p5', 'Qué llevamos al test con usuarios', 'Camila Rivas']],
      }),
    ],
  },
  {
    id: 'sess-planning-25',
    status: 'scheduled',
    title: 'Sprint Planning 25',
    date: '2026-10-22',
    startTime: '09:30',
    targetDuration: 90,
    hostName: 'Tomás Fuentes',
    mentions: ALL_MENTIONS,
    description: 'Capacidad, refinamiento y compromiso para el sprint 25.',
    updatedAt: '2026-10-16T13:00:00.000Z',
    blocks: [
      block('sp-b1', 'Capacidad del equipo', 10, {
        leader: 'Tomás Fuentes',
        points: [['sp-p1', 'Vacaciones y días libres', 'Tomás Fuentes']],
      }),
      block('sp-b2', 'Refinamiento de historias', 45, {
        leader: 'Andrés Muñoz',
        participants: 'Ingeniería y Diseño',
        points: [
          ['sp-p2', 'Integración del SDK de verificación', 'Diego Morales'],
          ['sp-p3', 'Guardar el progreso del registro', 'Andrés Muñoz'],
          ['sp-p4', 'Estados de error del escaneo', 'Sofía Herrera'],
        ],
      }),
      breakBlock('sp-b3', 10),
      block('sp-b4', 'Compromiso del sprint', 25, {
        leader: 'Tomás Fuentes',
        points: [['sp-p5', 'Objetivo del sprint y riesgos', 'Todos']],
      }),
    ],
  },
  {
    id: 'sess-sintesis-entrevistas',
    status: 'completed',
    title: 'Síntesis de entrevistas · Independientes',
    date: '2026-10-16',
    startTime: '15:00',
    targetDuration: 60,
    hostName: 'Camila Rivas',
    mentions: '@Camila Rivas @Sofía Herrera @Tomás Fuentes @Josefina Lagos',
    description: 'Afinidad de las 12 entrevistas y oportunidades para el Onboarding.',
    updatedAt: '2026-10-16T19:05:00.000Z',
    blocks: [
      block('se-b1', 'Hallazgos por tema', 35, {
        leader: 'Camila Rivas',
        points: [
          ['se-p1', 'Confianza y datos tributarios', 'Camila Rivas', 'done'],
          ['se-p2', 'Fotos de la cédula', 'Camila Rivas', 'done'],
        ],
      }),
      block('se-b2', 'Oportunidades', 25, {
        leader: 'Sofía Herrera',
        points: [['se-p3', 'Priorizar oportunidades', 'Todos', 'done']],
      }),
    ],
  },
  {
    id: 'sess-retro-23',
    status: 'completed',
    title: 'Retro Sprint 23',
    date: '2026-10-09',
    startTime: '17:00',
    targetDuration: 45,
    hostName: 'Tomás Fuentes',
    mentions: ALL_MENTIONS,
    description: 'Qué funcionó, qué mejorar y acuerdos para el sprint 24.',
    updatedAt: '2026-10-09T21:00:00.000Z',
    blocks: [
      block('rt-b1', 'Qué funcionó y qué mejorar', 30, {
        leader: 'Tomás Fuentes',
        points: [['rt-p1', 'Ronda de cada persona', 'Todos', 'done']],
      }),
      block('rt-b2', 'Acuerdos', 15, {
        leader: 'Tomás Fuentes',
        points: [['rt-p2', 'Acuerdos y responsables', 'Todos', 'done']],
      }),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tareas

export const KANBAN_COLUMNS = [
  {id: 'col-todo', name: 'Por hacer', position: 0, isDone: false},
  {id: 'col-doing', name: 'En curso', position: 1, isDone: false},
  {id: 'col-review', name: 'En revisión', position: 2, isDone: false},
  {id: 'col-done', name: 'Hecho', position: 3, isDone: true},
];

export const KANBAN_TAGS = [
  {id: 'tag-diseno', name: 'Diseño', color: 'purple'},
  {id: 'tag-research', name: 'Research', color: 'blue'},
  {id: 'tag-frontend', name: 'Frontend', color: 'green'},
  {id: 'tag-copy', name: 'Copy', color: 'yellow'},
  {id: 'tag-datos', name: 'Datos', color: 'orange'},
  {id: 'tag-bug', name: 'Bug', color: 'red'},
  {id: 'tag-a11y', name: 'Accesibilidad', color: 'pink'},
];

const subtasks = (prefix, items) => items.map(([text, done], index) => ({id: `${prefix}-st${index + 1}`, text, done: Boolean(done)}));

export const KANBAN_CARDS = [
  // Por hacer
  {number: 24, columnId: 'col-todo', title: 'Contraste insuficiente en chips de estado (modo oscuro)', assignee: person('u-benjamin'), priority: 'urgent', dueDate: '2026-10-17', tagIds: ['tag-bug', 'tag-a11y'],
    description: 'El chip «Pendiente» del Historial tiene contraste 2,9:1 sobre el fondo oscuro. Debe llegar a 4,5:1 sin cambiar la paleta del sistema.', docIds: ['doc-checklist-a11y']},
  {number: 18, columnId: 'col-todo', title: 'Diseñar estados de error del escaneo de cédula', assignee: person('u-sofia'), priority: 'high', dueDate: '2026-10-23', tagIds: ['tag-diseno', 'tag-a11y'],
    description: 'Foto borrosa, reflejo, cédula vencida y cámara sin permiso. Cada estado explica qué pasó y cómo corregirlo.',
    subtasks: subtasks('c18', [['Foto borrosa', true], ['Reflejo sobre la cédula'], ['Cédula vencida'], ['Cámara sin permiso']]), docIds: ['doc-spec-kyc']},
  {number: 21, columnId: 'col-todo', title: 'Definir eventos de analítica del nuevo onboarding', assignee: person('u-ignacia'), priority: 'normal', dueDate: '2026-10-24', tagIds: ['tag-datos'],
    subtasks: subtasks('c21', [['Mapear eventos actuales', true], ['Proponer eventos nuevos'], ['Validar nombres con Ingeniería']])},
  {number: 22, columnId: 'col-todo', title: 'Reescribir microcopy del paso de datos bancarios', assignee: person('u-josefina'), priority: 'normal', dueDate: '2026-10-27', tagIds: ['tag-copy'], docIds: ['doc-voz-tono']},
  {number: 23, columnId: 'col-todo', title: 'Reclutar 5 participantes para el test de pagos recurrentes', assignee: person('u-camila'), priority: 'low', dueDate: '2026-10-30', tagIds: ['tag-research']},
  // En curso
  {number: 15, columnId: 'col-doing', title: 'Prototipo navegable · Onboarding v3', assignee: person('u-sofia'), priority: 'high', dueDate: '2026-10-20', tagIds: ['tag-diseno'],
    description: 'Prototipo en Figma para el test del 20 al 22 de octubre. Incluye verificación, conexión con el SII y retomar el registro.',
    subtasks: subtasks('c15', [['Bienvenida y creación de cuenta', true], ['Verificación de identidad', true], ['Conexión con el SII', true], ['Primera boleta guiada', true], ['Retomar el registro'], ['Revisión con Josefina']]),
    docIds: ['doc-brief-onboarding', 'doc-plan-usabilidad']},
  {number: 16, columnId: 'col-doing', title: 'Integrar SDK de verificación de identidad', assignee: person('u-diego'), priority: 'high', dueDate: '2026-10-24', tagIds: ['tag-frontend'], threadId: '1429001122334455667',
    subtasks: subtasks('c16', [['Configurar credenciales de sandbox', true], ['Pantalla de escaneo', true], ['Prueba de vida'], ['Manejo de errores'], ['Pruebas en Android de gama baja']]), docIds: ['doc-spec-kyc']},
  {number: 19, columnId: 'col-doing', title: 'Mapa de oportunidades de las entrevistas', assignee: person('u-camila'), priority: 'normal', dueDate: '2026-10-16', tagIds: ['tag-research'], docIds: ['doc-hallazgos-entrevistas']},
  {number: 20, columnId: 'col-doing', title: 'Componente «Tarjeta de saldo» en el sistema de diseño', assignee: person('u-andres'), priority: 'normal', dueDate: null, tagIds: ['tag-diseno', 'tag-frontend'],
    subtasks: subtasks('c20', [['Variantes y tokens', true], ['Implementación en React Native'], ['Documentación']])},
  // En revisión
  {number: 12, columnId: 'col-review', title: 'Guía de voz y tono v2', assignee: person('u-josefina'), priority: 'normal', dueDate: '2026-10-20', tagIds: ['tag-copy'], docIds: ['doc-voz-tono']},
  {number: 14, columnId: 'col-review', title: 'Pantalla de resumen de cobros (web)', assignee: person('u-diego'), priority: 'normal', dueDate: '2026-10-21', tagIds: ['tag-frontend', 'tag-diseno'],
    subtasks: subtasks('c14', [['Layout responsive', true], ['Estados vacíos', true], ['Pruebas de accesibilidad', true]])},
  // Hecho
  {number: 17, columnId: 'col-done', title: 'Brief de Onboarding v3 aprobado', assignee: person('u-tomas'), priority: 'normal', tagIds: [], docIds: ['doc-brief-onboarding'], completedAt: '2026-10-08T18:00:00.000Z'},
  {number: 13, columnId: 'col-done', title: 'Dashboard de activación en Looker', assignee: person('u-ignacia'), priority: 'normal', tagIds: ['tag-datos'], completedAt: '2026-10-07T20:00:00.000Z'},
  {number: 11, columnId: 'col-done', title: 'Corregir foco perdido al cerrar modales', assignee: person('u-benjamin'), priority: 'high', tagIds: ['tag-bug', 'tag-a11y'], completedAt: '2026-10-06T15:00:00.000Z'},
  {number: 10, columnId: 'col-done', title: 'Flujo de recuperación de contraseña', assignee: person('u-sofia'), priority: 'normal', tagIds: ['tag-diseno'], completedAt: '2026-10-03T19:00:00.000Z'},
  {number: 9, columnId: 'col-done', title: 'Benchmark de onboarding en apps fintech', assignee: person('u-camila'), priority: 'low', tagIds: ['tag-research'], completedAt: '2026-10-01T14:00:00.000Z'},
];
