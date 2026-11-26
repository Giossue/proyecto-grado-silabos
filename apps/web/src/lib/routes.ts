import type { ActiveRole } from '@/api/session';

export type RoleCode = ActiveRole['code'];

const segment = (value: string): string => encodeURIComponent(value);

export const paths = {
  root: '/',
  login: '/ingresar',
  passwordRecovery: '/recuperar-contrasena',
  passwordReset: '/restablecer-contrasena',
  accountActivation: '/activar-cuenta',
  emailVerificationRequired: '/verificar-correo',
  roleSelection: '/rol',
  dashboard: '/panel',
  notifications: '/notificaciones',
  configuration: {
    profile: '/configuracion/perfil',
    security: '/configuracion/seguridad',
  },
  documents: (revision: string): string =>
    `/revisiones/${segment(revision)}/documentos`,
  admin: {
    root: '/admin',
    users: '/admin/usuarios',
    academic: '/admin/estructura-academica',
    academicWithSection: (section: string): string =>
      `/admin/estructura-academica?seccion=${encodeURIComponent(section)}`,
    convocations: '/admin/periodos',
    template: '/admin/plantilla',
    profile: '/admin/configuracion/perfil',
    security: '/admin/configuracion/seguridad',
    system: '/admin/configuracion/sistema',
    notifications: '/admin/notificaciones',
  },
  coordination: {
    root: '/coordinacion',
    notifications: '/coordinacion/notificaciones',
    profile: '/coordinacion/configuracion/perfil',
    security: '/coordinacion/configuracion/seguridad',
    emailNotices: '/coordinacion/configuracion/notificaciones',

    reviews: '/coordinacion/revisiones',
    review: (revision: string): string => `/coordinacion/revisiones/${segment(revision)}`,
    history: (revision: string): string => `/coordinacion/revisiones/${segment(revision)}/historial`,
    periodHistory: '/coordinacion/historial',
    academic: '/coordinacion/estructura-academica',
    curriculum: '/coordinacion/malla',
    scheduledSubjects: '/coordinacion/materias-asignaciones',
    careerProject: '/coordinacion/proyecto-carrera',
    careerProjectSubject: (subject: string): string => `/coordinacion/proyecto-carrera/${segment(subject)}`,
    teachers: '/coordinacion/docentes',
    documents: (revision: string): string =>
      `/coordinacion/revisiones/${segment(revision)}/documentos`,
  },
  teacher: {
    root: '/docente',
    notifications: '/docente/notificaciones',
    profile: '/docente/configuracion/perfil',
    security: '/docente/configuracion/seguridad',
    emailNotices: '/docente/configuracion/notificaciones',
    syllabi: '/docente/mis-silabos',
    syllabus: (syllabus: string): string => `/docente/mis-silabos/${segment(syllabus)}`,
    history: '/docente/historial',
    supportDocuments: '/docente/documentos-apoyo',
    historyCareer: (career: string): string => `/docente/historial/${segment(career)}`,
    documents: (revision: string): string =>
      `/docente/revisiones/${segment(revision)}/documentos`,
  },
  library: {
    root: '/biblioteca',
    notifications: '/biblioteca/notificaciones',
    profile: '/biblioteca/configuracion/perfil',
    security: '/biblioteca/configuracion/seguridad',
    emailNotices: '/biblioteca/configuracion/notificaciones',
    reviews: '/biblioteca/revisiones',
    history: '/biblioteca/historial',
    review: (revision: string): string => `/biblioteca/revisiones/${segment(revision)}`,
  },
} as const;

export type RoleArea = 'admin' | 'coordination' | 'teacher' | 'library';

type AreaPaths = {
  root: string;
  notifications: string;
  profile: string;
  security: string;
};

const roleAreas: Record<RoleCode, RoleArea> = {
  administrador: 'admin',
  coordinador: 'coordination',
  docente: 'teacher',
  bibliotecario: 'library',
};

const areaPaths: Record<RoleArea, AreaPaths> = {
  admin: paths.admin,
  coordination: paths.coordination,
  teacher: paths.teacher,
  library: paths.library,
};

const areaHomes: Record<RoleArea, string> = {
  admin: paths.admin.convocations,
  coordination: paths.coordination.reviews,
  teacher: paths.teacher.syllabi,
  library: paths.library.reviews,
};

const areaDocuments: Record<RoleArea, (revision: string) => string> = {
  admin: () => paths.admin.convocations,
  coordination: paths.coordination.documents,
  teacher: paths.teacher.documents,
  library: paths.library.review,
};

export const reviewAreaPaths = () => paths.coordination;

export const rolePrefix = (role: RoleCode): RoleArea | null =>
  Object.hasOwn(roleAreas, role) ? roleAreas[role] : null;

const areaOf = (role: RoleCode): AreaPaths | null => {
  const area = rolePrefix(role);
  return area ? areaPaths[area] : null;
};

export const roleHome = (role: RoleCode | undefined): string => {
  if (!role) return paths.root;
  const area = rolePrefix(role);
  return area ? areaHomes[area] : paths.roleSelection;
};

export const roleEntry = (role: RoleCode | undefined): string => {
  if (!role) return paths.roleSelection;
  return roleHome(role);
};

export type RoleScopedSetting = 'profile' | 'security';

export const areaSetting = (area: RoleArea, setting: RoleScopedSetting): string =>
  areaPaths[area][setting];

export const roleSetting = (role: RoleCode, setting: RoleScopedSetting): string =>
  areaOf(role)?.[setting] ?? paths.roleSelection;

export const roleNotifications = (role: RoleCode): string =>
  areaOf(role)?.notifications ?? paths.roleSelection;

export const roleDocuments = (role: RoleCode, revision: string): string => {
  const area = rolePrefix(role);
  return area ? areaDocuments[area](revision) : paths.roleSelection;
};

/** Configuración › Notificaciones (avisos por correo): Coordinación, Docente y Biblioteca. */
export const areaEmailNotices = (area: RoleArea): string | null =>
  area === 'coordination' ? paths.coordination.emailNotices
    : area === 'teacher' ? paths.teacher.emailNotices
      : area === 'library' ? paths.library.emailNotices
        : null;

export const areaForPath = (path: string): RoleArea | null =>
  (Object.keys(areaPaths) as RoleArea[]).find((area) => path.startsWith(`${areaPaths[area].root}/`)) ?? null;

export type RouteDefinition = {
  name: string;
  path: string;
  component?: string;
  states?: readonly string[];
  breadcrumb?: string;
  shortcut?: 'panel' | 'notifications' | 'profile' | 'security' | 'documents';
  roles?: readonly RoleCode[];
  guest?: boolean;
  requiresAuth?: boolean;
  layout?: 'syllabus-editor';
};

const authenticated = { requiresAuth: true } as const;
const admin = { ...authenticated, roles: ['administrador'] as const };
const coordinator = { ...authenticated, roles: ['coordinador'] as const };
const teacher = { ...authenticated, roles: ['docente'] as const };
const librarian = { ...authenticated, roles: ['bibliotecario'] as const };

export const routeRegistry: readonly RouteDefinition[] = [
  { name: 'login', path: paths.login, component: 'LoginPage', guest: true },
  { name: 'password-recovery', path: paths.passwordRecovery, component: 'PasswordRecoveryPage', guest: true },
  { name: 'password-reset', path: paths.passwordReset, component: 'ResetPasswordPage' },
  { name: 'email-verification-required', path: paths.emailVerificationRequired, component: 'VerifyEmailPage', ...authenticated },
  { name: 'role-selection', path: paths.roleSelection, component: 'WorkspacePage', ...authenticated },
  { name: 'dashboard', path: paths.dashboard, component: 'WorkspacePage', shortcut: 'panel', ...authenticated },
  { name: 'notifications', path: paths.notifications, component: 'NotificationsPage', shortcut: 'notifications', ...authenticated },
  { name: 'profile', path: paths.configuration.profile, component: 'ProfilePage', shortcut: 'profile', ...authenticated },
  { name: 'security', path: paths.configuration.security, component: 'SecurityPage', shortcut: 'security', ...authenticated },
  { name: 'documents', path: '/revisiones/:revision/documentos', component: 'DocumentsPage', shortcut: 'documents', ...authenticated },

  { name: 'admin-users', path: paths.admin.users, component: 'AdminUsersPage', breadcrumb: 'Usuarios y roles', ...admin },
  { name: 'admin-academic', path: paths.admin.academic, component: 'AcademicGovernancePage', breadcrumb: 'Facultades y carreras', ...admin },
  { name: 'admin-academic-section', path: '/admin/estructura-academica/:section', component: 'AcademicGovernancePage', breadcrumb: 'Facultades y carreras', ...admin },
  { name: 'admin-convocations', path: paths.admin.convocations, component: 'AdminProcessesPage', breadcrumb: 'Periodos académicos', ...admin },
  { name: 'admin-template', path: paths.admin.template, component: 'AdminTemplatePage', states: ['indice', 'lectura', 'edicion'], breadcrumb: 'Plantilla', ...admin },
  { name: 'admin-profile', path: paths.admin.profile, component: 'ProfilePage', shortcut: 'profile', ...admin },
  { name: 'admin-security', path: paths.admin.security, component: 'SecurityPage', shortcut: 'security', ...admin },
  { name: 'admin-system-settings', path: paths.admin.system, component: 'AdminSystemSettingsPage', breadcrumb: 'Sistema', ...admin },
  { name: 'admin-notifications', path: paths.admin.notifications, component: 'NotificationsPage', shortcut: 'notifications', ...admin },

  { name: 'coordination-notifications', path: paths.coordination.notifications, component: 'NotificationsPage', shortcut: 'notifications', ...coordinator },
  { name: 'coordination-profile', path: paths.coordination.profile, component: 'ProfilePage', shortcut: 'profile', ...coordinator },
  { name: 'coordination-security', path: paths.coordination.security, component: 'SecurityPage', shortcut: 'security', ...coordinator },
  { name: 'coordination-email-notices', path: paths.coordination.emailNotices, component: 'EmailPreferencesPage', breadcrumb: 'Notificaciones', ...coordinator },

  { name: 'coordination-reviews', path: paths.coordination.reviews, component: 'CoordinationReviewsPage', breadcrumb: 'Revisión', ...coordinator },
  { name: 'coordination-review', path: '/coordinacion/revisiones/:revision', component: 'CoordinationReviewDetailPage', breadcrumb: 'Detalle de revisión', ...coordinator },
  { name: 'coordination-history', path: '/coordinacion/revisiones/:revision/historial', component: 'CoordinationReviewHistoryPage', breadcrumb: 'Historial de versiones', layout: 'syllabus-editor', ...coordinator },
  { name: 'coordination-curriculum', path: paths.coordination.curriculum, component: 'CoordinationAcademicStructurePage', states: ['curriculum'], breadcrumb: 'Malla', ...coordinator },
  { name: 'coordination-career-project', path: paths.coordination.careerProject, component: 'CoordinationCareerProjectPage', breadcrumb: 'Proyecto de carrera', ...coordinator },
  { name: 'coordination-career-project-subject', path: '/coordinacion/proyecto-carrera/:subject', component: 'CoordinationSubjectProfilePage', breadcrumb: 'Proyecto de carrera de una materia', ...coordinator },
  { name: 'coordination-scheduled-subjects', path: paths.coordination.scheduledSubjects, component: 'CoordinationAcademicStructurePage', states: ['schedule'], breadcrumb: 'Materias y asignaciones', ...coordinator },
  { name: 'coordination-teachers', path: paths.coordination.teachers, component: 'CoordinationAcademicStructurePage', states: ['teachers'], breadcrumb: 'Docentes', ...coordinator },
  { name: 'coordination-documents', path: '/coordinacion/revisiones/:revision/documentos', component: 'DocumentsPage', shortcut: 'documents', ...coordinator },

  { name: 'teacher-notifications', path: paths.teacher.notifications, component: 'NotificationsPage', shortcut: 'notifications', ...teacher },
  { name: 'teacher-profile', path: paths.teacher.profile, component: 'ProfilePage', shortcut: 'profile', ...teacher },
  { name: 'teacher-security', path: paths.teacher.security, component: 'SecurityPage', shortcut: 'security', ...teacher },
  { name: 'teacher-email-notices', path: paths.teacher.emailNotices, component: 'EmailPreferencesPage', breadcrumb: 'Notificaciones', ...teacher },
  { name: 'teacher-syllabi', path: paths.teacher.syllabi, component: 'TeacherSyllabiPage', breadcrumb: 'Mis sílabos', ...teacher },
  { name: 'teacher-history', path: paths.teacher.history, component: 'TeacherHistoryPage', breadcrumb: 'Historial', ...teacher },
  { name: 'teacher-support-documents', path: paths.teacher.supportDocuments, component: 'SupportDocumentsPage', breadcrumb: 'Documentos de apoyo', ...teacher },
  { name: 'teacher-history-career', path: '/docente/historial/:career', component: 'TeacherHistoryCareerPage', breadcrumb: 'Historial', ...teacher },
  { name: 'teacher-syllabus', path: '/docente/mis-silabos/:syllabus', component: 'TeacherSyllabusDetailPage', states: ['resumen', 'edicion', 'ia', 'envio'], breadcrumb: 'Mis sílabos', ...teacher },
  { name: 'teacher-documents', path: '/docente/revisiones/:revision/documentos', component: 'DocumentsPage', shortcut: 'documents', ...teacher },

  { name: 'library-notifications', path: paths.library.notifications, component: 'NotificationsPage', shortcut: 'notifications', ...librarian },
  { name: 'library-profile', path: paths.library.profile, component: 'ProfilePage', shortcut: 'profile', ...librarian },
  { name: 'library-security', path: paths.library.security, component: 'SecurityPage', shortcut: 'security', ...librarian },
  { name: 'library-email-notices', path: paths.library.emailNotices, component: 'EmailPreferencesPage', breadcrumb: 'Notificaciones', ...librarian },
  { name: 'library-reviews', path: paths.library.reviews, component: 'LibraryReviewsPage', breadcrumb: 'Revisiones de biblioteca', ...librarian },
  { name: 'library-history', path: paths.library.history, component: 'LibraryHistoryPage', breadcrumb: 'Historial', ...librarian },
  { name: 'library-review', path: '/biblioteca/revisiones/:revision', component: 'LibraryReviewDetailPage', breadcrumb: 'Revisión de bibliografía', ...librarian },


];
