import type { RoleCode } from '@/lib/routes';

export type Shortcut = 'panel' | 'notifications' | 'profile' | 'security' | 'documents';

export type RouteMeta = {
  guest?: boolean;
  requiresAuth?: boolean;
  shell?: false;
  layout?: 'workspace' | 'syllabus-editor';
  title?: string;
  shortcut?: Shortcut;
  roles?: readonly RoleCode[];
};

export type RouteRecord = {
  path: string;
  meta: RouteMeta;
  redirect?: string;
};

const admin = { requiresAuth: true, roles: ['administrador'] } as const;
const coordinator = { requiresAuth: true, roles: ['coordinador'] } as const;
const teacher = { requiresAuth: true, roles: ['docente'] } as const;
const librarian = { requiresAuth: true, roles: ['bibliotecario'] } as const;

export const NOT_FOUND_PATH = '/:pathMatch(.*)*';

export const routeTable: readonly RouteRecord[] = [
  { path: '/ingresar', meta: { guest: true } },
  { path: '/recuperar-contrasena', meta: { guest: true } },
  { path: '/restablecer-contrasena', meta: {} },
  { path: '/activar-cuenta', meta: { shell: false } },
  { path: '/verificar-correo', meta: { requiresAuth: true, shell: false } },
  { path: '/verificar-dos-factores', meta: { guest: true } },
  { path: '/', meta: {}, redirect: '/ingresar' },
  { path: '/rol', meta: { requiresAuth: true, layout: 'workspace', title: 'Seleccionar ámbito de trabajo' } },

  { path: '/panel', meta: { requiresAuth: true, shortcut: 'panel', title: 'Panel' } },
  { path: '/notificaciones', meta: { requiresAuth: true, shortcut: 'notifications', title: 'Notificaciones' } },
  { path: '/configuracion/perfil', meta: { requiresAuth: true, shortcut: 'profile', title: 'Perfil' } },
  { path: '/configuracion/seguridad', meta: { requiresAuth: true, shortcut: 'security', title: 'Seguridad' } },
  { path: '/revisiones/:revision/documentos', meta: { requiresAuth: true, shortcut: 'documents', title: 'Documentos' } },

  { path: '/admin/panel', meta: {}, redirect: '/admin/convocatorias' },
  { path: '/admin/puesta-en-marcha', meta: {}, redirect: '/admin/convocatorias' },
  { path: '/admin/usuarios', meta: { ...admin, title: 'Usuarios y roles' } },
  { path: '/admin/estructura-academica', meta: { ...admin, title: 'Facultades y carreras' } },
  { path: '/admin/estructura-academica/:section', meta: { ...admin, title: 'Facultades y carreras' } },
  { path: '/admin/convocatorias', meta: { ...admin, title: 'Convocatorias' } },
  { path: '/admin/plantilla', meta: { ...admin, title: 'Plantilla' } },
  { path: '/admin/reportes', meta: { ...admin, title: 'Reportes' } },
  { path: '/admin/auditoria', meta: { ...admin, title: 'Auditoría' } },
  { path: '/admin/configuracion/perfil', meta: { ...admin, title: 'Perfil' } },
  { path: '/admin/configuracion/seguridad', meta: { ...admin, title: 'Seguridad' } },
  { path: '/admin/configuracion/sistema', meta: { ...admin, title: 'Sistema' } },
  { path: '/admin/notificaciones', meta: { ...admin, title: 'Notificaciones' } },

  { path: '/coordinacion/puesta-en-marcha', meta: {}, redirect: '/coordinacion/revisiones' },
  { path: '/coordinacion/notificaciones', meta: { ...coordinator, title: 'Notificaciones' } },
  { path: '/coordinacion/configuracion/perfil', meta: { ...coordinator, title: 'Perfil' } },
  { path: '/coordinacion/configuracion/seguridad', meta: { ...coordinator, title: 'Seguridad' } },
  { path: '/coordinacion/configuracion/notificaciones', meta: { ...coordinator, title: 'Notificaciones' } },

  { path: '/coordinacion/revisiones', meta: { ...coordinator, title: 'Revisión' } },
  { path: '/coordinacion/historial', meta: { ...coordinator, title: 'Historial' } },
  { path: '/coordinacion/revisiones/:revision', meta: { ...coordinator, title: 'Detalle de revisión' } },
  { path: '/coordinacion/revisiones/:revision/historial', meta: { ...coordinator, title: 'Historial de versiones', layout: 'syllabus-editor' } },
  { path: '/coordinacion/proyecto-carrera', meta: { ...coordinator, title: 'Proyecto de carrera' } },
  { path: '/coordinacion/proyecto-carrera/:subject', meta: { ...coordinator, title: 'Proyecto de carrera' } },
  { path: '/coordinacion/documentos-apoyo', meta: {}, redirect: '/coordinacion/proyecto-carrera?tab=documentos' },
  { path: '/coordinacion/malla', meta: { ...coordinator, title: 'Malla' } },
  { path: '/coordinacion/materias-asignaciones', meta: { ...coordinator, title: 'Materias y asignaciones' } },
  { path: '/coordinacion/docentes', meta: { ...coordinator, title: 'Docentes' } },
  { path: '/coordinacion/revisiones/:revision/documentos', meta: { ...coordinator, title: 'Documentos' } },

  { path: '/docente/notificaciones', meta: { ...teacher, title: 'Notificaciones' } },
  { path: '/docente/configuracion/perfil', meta: { ...teacher, title: 'Perfil' } },
  { path: '/docente/configuracion/seguridad', meta: { ...teacher, title: 'Seguridad' } },
  { path: '/docente/configuracion/perfil-docente', meta: { ...teacher, title: 'Perfil docente' } },
  { path: '/docente/configuracion/notificaciones', meta: { ...teacher, title: 'Notificaciones' } },
  { path: '/docente/mis-silabos', meta: { ...teacher, title: 'Mis sílabos' } },
  { path: '/docente/historial', meta: { ...teacher, title: 'Historial' } },
  { path: '/docente/documentos-apoyo', meta: { ...teacher, title: 'Documentos de apoyo' } },
  { path: '/docente/historial/:career', meta: { ...teacher, title: 'Historial' } },
  { path: '/docente/mis-silabos/:syllabus', meta: { ...teacher, title: 'Mis sílabos' } },
  { path: '/docente/revisiones/:revision/documentos', meta: { ...teacher, title: 'Documentos' } },

  { path: '/biblioteca/notificaciones', meta: { ...librarian, title: 'Notificaciones' } },
  { path: '/biblioteca/configuracion/perfil', meta: { ...librarian, title: 'Perfil' } },
  { path: '/biblioteca/configuracion/seguridad', meta: { ...librarian, title: 'Seguridad' } },
  { path: '/biblioteca/configuracion/notificaciones', meta: { ...librarian, title: 'Notificaciones' } },
  { path: '/biblioteca/revisiones', meta: { ...librarian, title: 'Revisiones de biblioteca' } },
  { path: '/biblioteca/historial', meta: { ...librarian, title: 'Historial' } },
  { path: '/biblioteca/revisiones/:revision', meta: { ...librarian, title: 'Revisión de bibliografía' } },

  { path: NOT_FOUND_PATH, meta: { title: 'Página no encontrada' } },
];

export type RouteMatch = {
  record: RouteRecord;
  params: Record<string, string>;
};

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const matchPattern = (pattern: string, path: string): Record<string, string> | null => {
  const expected = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of expected.entries()) {
    const value = actual[index] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decode(value);
    else if (part !== decode(value)) return null;
  }
  return params;
};

export const pathOf = (fullPath: string): string => {
  const path = fullPath.split(/[?#]/, 1)[0] || '/';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

export const matchRoute = (fullPath: string): RouteMatch => {
  const path = pathOf(fullPath);
  for (const record of routeTable) {
    if (record.path === NOT_FOUND_PATH) continue;
    const params = matchPattern(record.path, path);
    if (params) return { record, params };
  }
  return { record: routeTable[routeTable.length - 1], params: {} };
};
