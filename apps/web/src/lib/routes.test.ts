import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidIntendedRoute } from '@/lib/intended-route';
import { matchRoute, NOT_FOUND_PATH } from '@/lib/routeTable';
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

  it('Administración abre la malla, los paralelos, los docentes y el proyecto de una carrera con enlaces de códigos', () => {
    expect(paths.admin.careerCurriculum('c/1')).toBe('/admin/carreras/c%2F1/malla');
    expect(paths.admin.careerSchedule('SW')).toBe('/admin/carreras/sw/materias-asignaciones');
    expect(paths.admin.careerTeachers('SW')).toBe('/admin/carreras/sw/docentes');
    expect(paths.admin.careerProject('SW')).toBe('/admin/carreras/sw/proyecto-carrera');
    expect(paths.admin.careerProjectSubject('SW', 'SW-9', 'SW-101')).toBe('/admin/carreras/sw/proyecto-carrera/sw-9/sw-101');
    expect(paths.coordination.careerProjectSubject('SW-9', 'SW-101')).toBe('/coordinacion/proyecto-carrera/sw-9/sw-101');
    expect(paths.teacher.historyCareer('SW')).toBe('/docente/historial/sw');
    const adminCareer = routeRegistry.filter((route) => route.path.startsWith('/admin/carreras/'));
    expect(adminCareer.map((route) => [route.path, route.component])).toEqual([
      ['/admin/carreras/:career/malla', 'CoordinationAcademicStructurePage'],
      ['/admin/carreras/:career/materias-asignaciones', 'CoordinationAcademicStructurePage'],
      ['/admin/carreras/:career/docentes', 'CoordinationAcademicStructurePage'],
      ['/admin/carreras/:career/proyecto-carrera', 'CoordinationCareerProjectPage'],
      ['/admin/carreras/:career/proyecto-carrera/:malla/:subject', 'CoordinationSubjectProfilePage'],
    ]);
    expect(adminCareer.every((route) => route.roles?.join() === 'administrador')).toBe(true);
  });

  it('cada pantalla con código tiene ruta, página y guarda; los enlaces antiguos quedan como página no encontrada', () => {
    const screens = [
      ['/admin/carreras/sw/malla', '(shell)/admin/carreras/[career]/malla', 'administrador'],
      ['/admin/carreras/sw/materias-asignaciones', '(shell)/admin/carreras/[career]/materias-asignaciones', 'administrador'],
      ['/admin/carreras/sw/docentes', '(shell)/admin/carreras/[career]/docentes', 'administrador'],
      ['/admin/carreras/sw/proyecto-carrera', '(shell)/admin/carreras/[career]/proyecto-carrera', 'administrador'],
      ['/admin/carreras/sw/proyecto-carrera/sw-9/sw-101', '(shell)/admin/carreras/[career]/proyecto-carrera/[malla]/[subject]', 'administrador'],
      ['/coordinacion/proyecto-carrera/SW-9/SW-101', '(shell)/coordinacion/proyecto-carrera/[malla]/[subject]', 'coordinador'],
      ['/docente/historial/SW', '(shell)/docente/historial/[career]', 'docente'],
    ];
    for (const [path, folder, role] of screens) {
      expect(matchRoute(path!).record.meta.roles, path).toEqual([role]);
      expect(existsSync(join('src', 'app', ...folder!.split('/'), 'page.tsx')), path).toBe(true);
      expect(isValidIntendedRoute(path), path).toBe(true);
    }
    const uuid = '01a1c5bc-79ca-7331-8f0f-66d63f61c699';
    for (const path of [
      `/admin/estructura-academica/carreras/${uuid}/malla`,
      `/admin/estructura-academica/carreras/${uuid}/docentes`,
      `/admin/estructura-academica/carreras/${uuid}/proyecto-carrera/${uuid}`,
      `/coordinacion/proyecto-carrera/${uuid}`,
    ]) {
      expect(matchRoute(path).record.path, path).toBe(NOT_FOUND_PATH);
      expect(isValidIntendedRoute(path), path).toBe(false);
    }
    expect(existsSync(join('src', 'app', '(shell)', 'admin', 'estructura-academica', '[section]', '[career]'))).toBe(false);
  });
});
