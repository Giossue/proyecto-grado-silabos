import {
    BookOpenCheck,
    Building2,
    CalendarRange,
    ClipboardCheck,
    FileStack,
    FileText,
    FolderOpen,
    Library,
    UsersRound,
} from 'lucide-react';
import type { Session } from '@/api/session';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { paths } from '@/lib/routes';
import { useSession } from '@/state/session';
import type { NavItem } from '@/types';

export const mainNavItemsFor = (session: Session | null): NavItem[] => {
    const code = session?.active_role?.code;

    return [
        ...(code === 'administrador'
            ? [
                  { title: 'Facultades y carreras', href: paths.admin.academic, icon: Building2 },
                  { title: 'Usuarios y roles', href: paths.admin.users, icon: UsersRound },
                  { title: 'Plantilla', href: paths.admin.template, icon: FileStack },
                  { title: 'Periodos académicos', href: paths.admin.convocations, icon: CalendarRange },
              ]
            : []),
        ...(code === 'coordinador'
            ? [
                  { title: 'Revisión', href: paths.coordination.reviews, icon: ClipboardCheck },
                  { title: 'Materias y asignaciones', href: paths.coordination.scheduledSubjects, icon: Building2 },
                  { title: 'Docentes', href: paths.coordination.teachers, icon: UsersRound },
                  { title: 'Proyecto de carrera', href: paths.coordination.careerProject, icon: FolderOpen },
                  { title: 'Malla', href: paths.coordination.curriculum, icon: BookOpenCheck },
              ]
            : []),
        ...(code === 'docente'
            ? [
                  { title: 'Mis sílabos', href: paths.teacher.syllabi, icon: BookOpenCheck },
                  { title: 'Documentos de apoyo', href: paths.teacher.supportDocuments, icon: FileText },
              ]
            : []),
        ...(code === 'bibliotecario'
            ? [{ title: 'Revisiones de biblioteca', href: paths.library.reviews, icon: Library }]
            : []),
    ];
};

export function useMainNavItems(): NavItem[] {
    return mainNavItemsFor(useSession().session);
}

export function useActiveNavItem(): NavItem | null {
    const items = useMainNavItems();
    const { isCurrentOrParentUrl } = useCurrentUrl();
    for (const item of items) {
        const child = item.items?.find((c) => isCurrentOrParentUrl(c.href));
        if (child) return { ...child, icon: child.icon ?? item.icon };
        if (isCurrentOrParentUrl(item.href)) return item;
    }
    return null;
}
