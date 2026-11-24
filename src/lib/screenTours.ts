import type { Side } from 'driver.js';

/** Un paso de la guía de una pantalla: resalta un elemento real; si no existe en ese momento, se omite. */
export type TourStep = { selector: string; title: string; description: string; side?: Side };

const step = (selector: string, title: string, description: string, side?: Side): TourStep => ({ selector, title, description, side });

const TABLE = '[data-slot="table-container"]';
const FILTERS = '[data-tour="filters"]';
const ACTIONS = '[data-tour="page-actions"]';
const TABS = '[role="tablist"]';
const METRICS = '[data-tour="metrics"]';
const DEADLINE = '[data-tour="deadline"]';
const SHEET = '[aria-label="Vista previa del sílabo"]';
const CHECKLIST = '.driver-checklist-launcher';

const shell = {
  menu: step('[data-sidebar="sidebar"]', 'Menú', 'Aquí están todas sus pantallas. El botón de arriba a la izquierda lo esconde o lo muestra', 'right'),
  notifications: step('[aria-label^="Notificaciones"]', 'Avisos', 'Aquí le llegan los avisos. Pulse uno para ir a donde corresponde', 'bottom'),
  theme: step('[aria-label^="Tema visual"]', 'Claro u oscuro', 'Cambia los colores de la pantalla', 'bottom'),
  user: step('[aria-label="Menú de usuario"]', 'Su cuenta', 'Cambie de carrera o de rol, vea su perfil o cierre la sesión', 'bottom'),
  accessibility: step('[aria-label="Accesibilidad"]', 'Accesibilidad', 'Agrande el texto, suba el contraste o quite las animaciones', 'bottom'),
};
const basics = [shell.menu, shell.notifications, shell.theme, shell.accessibility, shell.user];

const checklist = step(CHECKLIST, 'Antes de empezar', 'Lo que falta preparar antes de abrir una convocatoria. Pulse un paso y le mostramos dónde se hace', 'left');

/** Guía por pantalla, con la ruta del frontend como clave. Después de estos pasos, la guía cierra sola. */
export const screenTours: Record<string, TourStep[]> = {
  '/admin/convocatorias': [
    step(METRICS, 'Resumen', 'Cómo va la convocatoria: avance, días que faltan y carreras que aún no empiezan', 'bottom'),
    step(ACTIONS, 'Nueva convocatoria', 'Ponga las fechas de clases y de entrega de sílabos. Se activa al terminar «Antes de empezar». Solo puede haber una a la vez', 'left'),
    step(FILTERS, 'Buscar', 'Busque un período o filtre por estado', 'bottom'),
    step(TABLE, 'Períodos', 'Pulse un período para ver qué puede hacer: abrir, pausar, dar más plazo, finalizar o eliminar', 'top'),
    checklist,
    ...basics,
  ],
  '/admin/estructura-academica': [
    step(ACTIONS, 'Crear', 'Cree una facultad o una carrera. Las carreras también se pueden subir con un Excel', 'left'),
    step(TABS, 'Facultades y carreras', 'Cambie entre la lista de facultades y la de carreras', 'bottom'),
    step(FILTERS, 'Buscar', 'Busque por nombre o filtre por campus', 'bottom'),
    step(TABLE, 'Lista', 'Pulse una fila para editarla. Nada se borra: lo que ya no se usa se desactiva', 'top'),
  ],
  '/admin/usuarios': [
    step(ACTIONS, 'Crear cuentas', 'Cree una cuenta o suba varias con un Excel. Cada persona recibe un correo para entrar', 'left'),
    step(FILTERS, 'Buscar', 'Busque por nombre o correo, o filtre por rol, carrera o estado', 'bottom'),
    step(TABLE, 'Cuentas', 'Pulse una persona para ver sus datos, cambiar sus roles o quitarle el acceso', 'top'),
  ],
  '/admin/plantilla': [
    step('[data-tour="template-edit"]', 'Editar', 'Abre la plantilla para cambiarla. Si hay una convocatoria abierta, primero páusela', 'left'),
    // Pasos del editor: solo aparecen mientras se edita.
    step('[data-tour="template-back"]', 'Volver', 'Sale del editor. Si no guardó, le avisa antes', 'bottom'),
    step('[aria-label="Formato del texto"]', 'Formato', 'Negrita, colores, listas y tablas. Escriba dentro de un campo para usarlo', 'bottom'),
    step('[data-tour="template-selection"]', 'Campo elegido', 'Pulse un campo de la hoja y aquí elige quién lo llena, lo mueve o lo borra', 'bottom'),
    step('[aria-label="Opciones avanzadas"]', 'Más opciones', 'Márgenes y tamaño de letra. También puede reemplazar toda la plantilla con un archivo', 'bottom'),
    step('[data-tour="template-save"]', 'Guardar', 'Guarda sus cambios. Un punto en el botón le avisa que falta guardar', 'bottom'),
    step('[data-sheet]', 'La hoja', 'Así se verá el sílabo. Escriba directo sobre ella. Pase el ratón entre dos campos para agregar uno nuevo', 'left'),
    step('[data-tour="template-assistant"]', 'Asistente', 'Pídale cambios con sus palabras. Si le gusta la propuesta, aplíquela y luego guarde', 'left'),
  ],
  '/admin/configuracion/sistema': [
    step('[data-tour="settings-notices"]', 'Correos', 'Active o apague los avisos por correo y elija a qué hora llega el resumen del día', 'bottom'),
    step('[data-tour="settings-ai"]', 'Asistente', 'Conecte el asistente con un servicio de inteligencia artificial y pruebe que funcione', 'bottom'),
    step('[data-tour="settings-library"]', 'Biblioteca', 'Conecte el catálogo de la biblioteca para que los docentes busquen libros', 'top'),
  ],
  '/coordinacion/revisiones': [
    step(DEADLINE, 'Plazo', 'Hasta cuándo pueden entregar los docentes', 'bottom'),
    step(ACTIONS, 'Convocatoria de su carrera', 'Ábrala cuando termine «Antes de empezar». También puede pausarla y reanudarla', 'left'),
    step(TABS, 'Por revisar y seguimiento', '«Cola de revisión» es lo que le toca revisar. «Seguimiento» muestra cómo va cada sílabo', 'bottom'),
    step(FILTERS, 'Buscar', 'Busque una materia por nombre o código', 'bottom'),
    step(TABLE, 'Sílabos', 'Llegan con la bibliografía ya verificada por Biblioteca. Pulse uno para revisarlo: puede pedir correcciones o firmarlo y aprobarlo', 'top'),
    checklist,
    ...basics,
  ],
  '/coordinacion/revisiones/:revision': [
    step(ACTIONS, 'Qué puede hacer', 'Pida correcciones al docente o firme y apruebe el sílabo. También puede ver versiones anteriores y comparar', 'bottom'),
    step(SHEET, 'El sílabo', 'Así lo entregó el docente. Léalo antes de decidir', 'top'),
  ],
  '/coordinacion/revisiones/:revision/historial': [
    step('aside[aria-label="Historial de versiones"]', 'Versiones', 'Pulse una versión para verla. Debajo de cada una están sus comentarios', 'left'),
    step(SHEET, 'El sílabo', 'Así quedó en esa versión. Use «Resaltar cambios» para ver qué cambió', 'top'),
  ],
  '/coordinacion/materias-asignaciones': [
    step(FILTERS, 'Buscar', 'Busque una materia o filtre por ciclo, paralelo o jornada', 'bottom'),
    step(TABLE, 'Materias', 'Marque materias para agregar paralelos o poner docente a varias a la vez. Pulse una para cambiar sus paralelos', 'top'),
    step('[aria-label="Acciones masivas de materias"]', 'Para lo marcado', 'Agregue un paralelo o asigne jornada y docente a todo lo que marcó', 'bottom'),
  ],
  '/coordinacion/docentes': [
    step(ACTIONS, 'Crear docente', 'Cree un docente o suba varios con un Excel. Cada uno recibe un correo para entrar', 'left'),
    step(FILTERS, 'Buscar', 'Busque por nombre o correo, o filtre por estado', 'bottom'),
    step(TABLE, 'Docentes', 'Pulse uno para ver sus datos, reenviarle la invitación o quitarlo de la carrera', 'top'),
  ],
  '/coordinacion/proyecto-carrera': [
    step(TABS, 'Materias y documentos', 'Cambie entre el proyecto de cada materia y los documentos de apoyo', 'bottom'),
    step(ACTIONS, 'Excel o documentos', 'En «Materias», llene varias a la vez con un Excel. En «Documentos de apoyo», suba un archivo', 'left'),
    step(FILTERS, 'Buscar', 'Busque una materia o filtre por ciclo o si está completa', 'bottom'),
    step('[data-tour="career-subjects"]', 'Materias por ciclo', 'Pulse una materia para llenar su proyecto. El docente lo recibe ya escrito', 'top'),
    step(TABLE, 'Documentos de apoyo', 'Archivos para que sus docentes conozcan mejor sus materias. Pulse uno para verlo', 'top'),
  ],
  '/coordinacion/historial': [
    step(FILTERS, 'Buscar', 'Busque por materia o código, o elija un período', 'bottom'),
    step(TABLE, 'Sílabos aprobados', 'Pulse uno para verlo o use «Ver PDF» para abrir el documento firmado', 'top'),
  ],
  '/coordinacion/malla': [
    step(ACTIONS, 'Editar malla', 'Cambie ciclos, materias y requisitos. También puede subir la malla con un Excel', 'left'),
    step('[aria-label="Zoom de la malla"]', 'Tamaño de la malla', 'Ajústela al ancho o elija 50 %, 75 % o 100 %. Se mueve con la rueda o las barras', 'right'),
    // Pasos del editor: solo aparecen mientras se edita.
    step('[data-tour="curriculum-back"]', 'Volver', 'Sale del editor', 'bottom'),
    step('[aria-label="Configurar ciclos"]', 'Ciclos', 'Cambie cuántos ciclos tiene la carrera', 'bottom'),
    step('[data-tour="curriculum-add"]', 'Agregar materia', 'Agrega una materia en ese ciclo. Arrastre de una materia a otra para unirlas como requisito', 'top'),
  ],
  '/biblioteca/revisiones': [
    step(ACTIONS, 'Historial', 'Los sílabos de períodos que ya terminaron', 'left'),
    step(METRICS, 'Resumen', 'Cuántos hay por revisar, aprobados y devueltos', 'bottom'),
    step(FILTERS, 'Buscar', 'Busque por materia, carrera o docente, o filtre por facultad y estado. La facultad se recuerda', 'bottom'),
    step(TABLE, 'Sílabos', 'Pulse uno para revisar sus libros y firmarlo, o devolverlo al docente', 'top'),
    shell.notifications,
    shell.theme,
    shell.user,
  ],
  '/biblioteca/revisiones/:revision': [
    step(ACTIONS, 'Qué puede hacer', 'Si los libros están bien, firme y envíe el sílabo a coordinación. Si algo falla, devuélvalo al docente diciendo qué corregir', 'bottom'),
    step('[aria-label="Bibliografía"]', 'Libros del sílabo', 'Revise que cada libro esté en la biblioteca y que sus datos sean correctos', 'top'),
  ],
  '/biblioteca/historial': [
    step(FILTERS, 'Buscar', 'Busque o filtre por período o facultad. «Solo los míos» muestra los que usted atendió', 'bottom'),
    step(TABLE, 'Sílabos', 'Pulse uno para verlo. En los aprobados puede abrir el PDF', 'top'),
  ],
  '/docente/mis-silabos': [
    step(DEADLINE, 'Plazo', 'Hasta cuándo puede entregar. Después solo puede ver sus sílabos', 'bottom'),
    step(ACTIONS, 'Historial', 'Sus sílabos de períodos anteriores', 'left'),
    step(FILTERS, 'Buscar', 'Busque una materia o filtre por estado', 'bottom'),
    step('ul[aria-label="Mis sílabos"]', 'Sus sílabos', 'Uno por materia. Pulse uno para empezar o seguir', 'top'),
    ...basics,
  ],
  '/docente/mis-silabos/:syllabus': [
    step(DEADLINE, 'Plazo', 'Hasta cuándo puede entregar este sílabo', 'bottom'),
    step('.review-comment', 'Correcciones', 'Lo que le pidieron cambiar. Corríjalo y vuelva a enviar', 'bottom'),
    step('[aria-label="Secciones del sílabo"]', 'Secciones', 'Pase de una parte del sílabo a otra', 'bottom'),
    step('.teacher-form', 'Su parte', 'Llene los campos con asterisco. Lo demás ya viene escrito. Todo se guarda solo mientras escribe', 'top'),
    step('[aria-label="Vista previa"]', 'Vista previa', 'Vea cómo queda el sílabo terminado', 'bottom'),
    step('[data-tour="syllabus-submit"]', 'Enviar', 'Cuando termine, envíelo a revisión. La primera vez lo firma con su archivo de firma electrónica', 'bottom'),
  ],
  '/docente/historial': [
    step(TABLE, 'Carreras', 'Pulse una carrera para ver sus sílabos de períodos anteriores', 'top'),
  ],
  '/docente/historial/:career': [
    step(TABLE, 'Sílabos anteriores', 'Uno por período. Pulse uno para verlo', 'top'),
  ],
  '/docente/documentos-apoyo': [
    step(FILTERS, 'Buscar', 'Busque un documento por su nombre', 'bottom'),
    step(TABLE, 'Documentos', 'Archivos que le dejó su coordinación. Pulse uno para verlo', 'top'),
  ],
};

screenTours['/admin/estructura-academica/:section'] = screenTours['/admin/estructura-academica']!;

/** Pantallas que tienen todos los roles. */
const sharedScreens: Record<string, TourStep[]> = {
  'configuracion/perfil': [
    step('[data-tour="profile-form"]', 'Sus datos', 'Cambie su nombre. El correo solo se puede cambiar antes de activar la cuenta', 'top'),
    step('[data-tour="profile-readonly"]', 'Sus datos', 'Si su nombre o correo están mal, pida el cambio a Administración', 'top'),
  ],
  'configuracion/seguridad': [
    step('[data-tour="security-password"]', 'Contraseña', 'Escriba la actual y la nueva para cambiarla', 'top'),
    step('[data-tour="security-reset"]', 'Por correo', 'Si no recuerda su contraseña, le enviamos un enlace para crear otra', 'top'),
    step('[data-tour="security-2fa"]', 'Doble verificación', 'Al entrar le pide también un código del celular. Guarde los códigos de respaldo por si lo pierde', 'top'),
  ],
  'configuracion/notificaciones': [
    step('[data-tour="email-notices"]', 'Avisos por correo', 'Elija qué avisos le llegan también al correo. En el sistema los verá siempre', 'top'),
  ],
  notificaciones: [
    step(ACTIONS, 'Marcar todo', 'Marca todos los avisos como leídos', 'left'),
    step('nav[aria-label="Filtrar notificaciones"]', 'Ver', 'Vea solo los nuevos o todos', 'bottom'),
    step('[data-tour="notifications-list"]', 'Avisos', 'Pulse «Abrir» para ir a donde corresponde, o «Marcar leída» para quitarlo de los nuevos', 'top'),
  ],
  'revisiones/:revision/documentos': [step(ACTIONS, 'PDF', 'Vea o descargue el PDF del sílabo aprobado', 'left')],
};
for (const role of ['admin', 'coordinacion', 'docente', 'biblioteca']) {
  for (const [screen, steps] of Object.entries(sharedScreens)) {
    screenTours[`/${role}/${screen}`] ??= steps;
  }
}
