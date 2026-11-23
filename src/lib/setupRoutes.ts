import { paths } from '@/lib/routes';

/** Pantalla donde se completa cada paso del checklist «Antes de empezar», por rol. */
export const setupRoutes: Record<string, Record<string, string>> = {
    administrador: {
        faculties: paths.admin.academic,
        careers: paths.admin.academicWithSection('carrera'),
        accounts: paths.admin.users,
        coordinators: paths.admin.academicWithSection('carrera'),
        template: paths.admin.template,
    },
    coordinador: {
        curriculum: paths.coordination.curriculum,
        scheduled_subjects: paths.coordination.scheduledSubjects,
        teachers: paths.coordination.teachers,
        parallels: paths.coordination.scheduledSubjects,
        career_project: paths.coordination.careerProject,
    },
};
