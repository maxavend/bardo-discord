// Menú nativo en español. Las acciones de Bardo se envían a la página como
// comandos; las de edición y ventana son las del sistema.
import {app, Menu, shell} from 'electron';
import {INSTALL_URL, ORIGIN} from './config.js';

const isMac = process.platform === 'darwin';

export function buildMenu({send, signOut, checkForUpdates}) {
  const command = (label, id, accelerator) => ({label, accelerator, click: () => send(id)});
  const signOutItem = {label: 'Cerrar sesión…', click: () => signOut()};
  const updatesItem = {label: 'Buscar actualizaciones…', click: () => checkForUpdates({manual: true})};

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        {role: 'about', label: `Acerca de ${app.name}`},
        updatesItem,
        {type: 'separator'},
        signOutItem,
        {type: 'separator'},
        {role: 'services', label: 'Servicios'},
        {type: 'separator'},
        {role: 'hide', label: `Ocultar ${app.name}`},
        {role: 'hideOthers', label: 'Ocultar otros'},
        {role: 'unhide', label: 'Mostrar todo'},
        {type: 'separator'},
        {role: 'quit', label: `Salir de ${app.name}`},
      ],
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        command('Nuevo documento', 'new-document', 'CmdOrCtrl+N'),
        {type: 'separator'},
        command('Ir a un canal…', 'quick-switcher', 'CmdOrCtrl+P'),
        command('Mis servidores', 'servers', 'CmdOrCtrl+Shift+O'),
        ...(isMac ? [] : [{type: 'separator'}, updatesItem, signOutItem]),
        {type: 'separator'},
        isMac ? {role: 'close', label: 'Cerrar ventana'} : {role: 'quit', label: 'Salir'},
      ],
    },
    {
      label: 'Editar',
      submenu: [
        {role: 'undo', label: 'Deshacer'},
        {role: 'redo', label: 'Rehacer'},
        {type: 'separator'},
        {role: 'cut', label: 'Cortar'},
        {role: 'copy', label: 'Copiar'},
        {role: 'paste', label: 'Pegar'},
        {role: 'pasteAndMatchStyle', label: 'Pegar sin formato'},
        {role: 'selectAll', label: 'Seleccionar todo'},
      ],
    },
    {
      label: 'Ver',
      submenu: [
        command('Inicio', 'go-home', 'CmdOrCtrl+1'),
        command('Documentos', 'go-docs', 'CmdOrCtrl+2'),
        command('Reuniones', 'go-planner', 'CmdOrCtrl+3'),
        command('Tareas', 'go-kanban', 'CmdOrCtrl+4'),
        {type: 'separator'},
        {role: 'reload', label: 'Recargar'},
        ...(app.isPackaged ? [] : [{role: 'toggleDevTools', label: 'Herramientas de desarrollo'}]),
        {type: 'separator'},
        {role: 'resetZoom', label: 'Tamaño real'},
        {role: 'zoomIn', label: 'Acercar'},
        {role: 'zoomOut', label: 'Alejar'},
        {type: 'separator'},
        {role: 'togglefullscreen', label: 'Pantalla completa'},
      ],
    },
    {
      label: 'Ventana',
      role: 'windowMenu',
      submenu: [
        {role: 'minimize', label: 'Minimizar'},
        {role: 'zoom', label: 'Zoom'},
        ...(isMac ? [{type: 'separator'}, {role: 'front', label: 'Traer todo al frente'}] : [{role: 'close', label: 'Cerrar'}]),
      ],
    },
    {
      label: 'Ayuda',
      role: 'help',
      submenu: [
        command('Atajos de teclado', 'shortcuts', 'CmdOrCtrl+/'),
        {type: 'separator'},
        {label: 'Agregar Bardo a un servidor de Discord', click: () => shell.openExternal(INSTALL_URL)},
        {label: 'Abrir Bardo en el navegador', click: () => shell.openExternal(ORIGIN)},
        ...(isMac ? [] : [{type: 'separator'}, {label: `${app.name} ${app.getVersion()}`, enabled: false}]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
