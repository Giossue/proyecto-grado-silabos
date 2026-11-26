import { describe, expect, it } from 'vitest';
import { areaForPath, paths, roleDocuments, roleEntry, roleHome, roleNotifications, roleSetting, routeRegistry, type RoleCode } from '@/lib/routes';

describe('contrato de rutas', () => {
  it('construye destinos dinámicos sin permitir segmentos ambiguos', () => {
    expect(paths.teacher.syllabus('silabo/1')).toBe('/docente/mis-silabos/silabo%2F1');
  });

  it('resuelve el inicio y la configuración del rol activo', () => {
    expect(roleHome('administrador')).toBe(paths.admin.convocations);
    expect(roleHome('coordinador')).toBe(paths.coordination.reviews);
    expect(roleHome('docente')).toBe(paths.teacher.syllabi);
    expect(roleSetting('docente', 'security')).toBe(paths.teacher.security);
    expect(roleHome('bibliotecario')).toBe('/biblioteca/revisiones');
    expect(roleSetting('bibliotecario', 'profile')).toBe('/biblioteca/configuracion/perfil');
    expect(roleNotifications('bibliotecario')).toBe('/biblioteca/notificaciones');
    expect(roleDocuments('bibliotecario', 'revision-1')).toBe('/biblioteca/revisiones/revision-1');
    expect(roleDocuments('coordinador', 'revision-1')).toBe('/coordinacion/revisiones/revision-1/documentos');
    expect(areaForPath('/biblioteca/configuracion/perfil')).toBe('library');
    expect(areaForPath('/configuracion/perfil')).toBeNull();
  });

  it('no trata un rol desconocido como docente', () => {
    const unknown = 'rol_futuro' as RoleCode;
    expect(roleHome(unknown)).toBe(paths.roleSelection);
    expect(roleEntry(unknown)).toBe(paths.roleSelection);
    expect(roleSetting(unknown, 'profile')).toBe(paths.roleSelection);
    expect(roleNotifications(unknown)).toBe(paths.roleSelection);
    expect(roleDocuments(unknown, 'revision-1')).toBe(paths.roleSelection);
  });

  it('envía cada rol a su inicio al entrar: salvo Administración, a su lista de trabajo', () => {
    expect(roleEntry('docente')).toBe(paths.teacher.syllabi);
    expect(roleEntry('coordinador')).toBe(paths.coordination.reviews);
    expect(roleEntry('bibliotecario')).toBe(paths.library.reviews);
    expect(roleEntry(undefined)).toBe(paths.roleSelection);
  });

  it('usa rutas en español para el acceso y el panel', () => {
    expect(routeRegistry.find((route) => route.name === 'login')?.path).toBe('/ingresar');
    expect(routeRegistry.find((route) => route.name === 'dashboard')?.path).toBe('/panel');
  });

  it('no conserva rutas en inglés ni alias retirados', () => {
    const retired = ['/login', '/dashboard', '/settings', '/fuentes', '/seguridad', '/administracion', '/mis-silabos', '/docente/panel', '/biblioteca/panel', '/coordinacion/panel'];
    for (const route of routeRegistry) expect(retired.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`))).toBe(false);
  });

  it('mantiene destinos únicos y metadatos de autorización', () => {
    expect(new Set(routeRegistry.map((route) => route.path)).size).toBe(routeRegistry.length);
    expect(routeRegistry.find((route) => route.name === 'admin-users')).toMatchObject({
      component: 'AdminUsersPage',
      roles: ['administrador'],
      requiresAuth: true,
    });
    expect(routeRegistry.find((route) => route.name === 'teacher-syllabus')).toMatchObject({
      component: 'TeacherSyllabusDetailPage',
      states: ['resumen', 'edicion', 'ia', 'envio'],
      roles: ['docente'],
      requiresAuth: true,
    });
    expect(routeRegistry.find((route) => route.name === 'teacher-syllabus')?.layout).toBeUndefined();
    expect(routeRegistry.find((route) => route.name === 'coordination-review')?.layout).toBeUndefined();
    expect(routeRegistry.find((route) => route.name === 'library-review')).toMatchObject({
      path: '/biblioteca/revisiones/:revision',
      component: 'LibraryReviewDetailPage',
      roles: ['bibliotecario'],
      requiresAuth: true,
    });
    expect(routeRegistry.find((route) => route.name === 'admin-template')?.states).toEqual([
      'indice',
      'lectura',
      'edicion',
    ]);
  });

  it('ya no existe la pestaña «Perfil docente»: la formación es un campo del sílabo', () => {
    expect(routeRegistry.some((route) => route.name === 'teacher-formation' || route.path === '/docente/configuracion/perfil-docente')).toBe(false);
    expect(Object.keys(paths.teacher)).not.toContain('formation');
  });
});
