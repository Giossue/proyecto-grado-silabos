<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import {
    BookOpenCheck,
    Bell,
    Building2,
    CalendarRange,
    ClipboardCheck,
    FileStack,
    LayoutGrid,
    LibraryBig,
    ListRestart,
    ChartNoAxesCombined,
    Repeat2,
    RefreshCcwDot,
    ScrollText,
    UsersRound,
} from '@lucide/vue';
import { computed, watch } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import NavFooter from '@/components/NavFooter.vue';
import NavMain from '@/components/NavMain.vue';
import NavUser from '@/components/NavUser.vue';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { dashboard } from '@/routes';
import { index as academicIndex } from '@/routes/admin/academic';
import { index as auditIndex } from '@/routes/admin/audit';
import { index as coordinationsIndex } from '@/routes/admin/coordinations';
import { index as integrationsIndex } from '@/routes/admin/integrations';
import { index as jobsIndex } from '@/routes/admin/jobs';
import { index as templatesIndex } from '@/routes/admin/templates';
import { index as usersIndex } from '@/routes/admin/users';
import { index as convocationsIndex } from '@/routes/convocations';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import { index as offeringsIndex } from '@/routes/coordination/academic/offerings';
import { index as teacherAssignmentsIndex } from '@/routes/coordination/academic/teacher-assignments';
import { index as notificationsIndex } from '@/routes/notifications';
import { index as reportsIndex } from '@/routes/reports';
import { index as reviewsIndex } from '@/routes/reviews';
import { index as roleIndex } from '@/routes/role';
import { index as sourcesIndex } from '@/routes/sources';
import { index as syllabiIndex } from '@/routes/syllabi';
import type { NavItem } from '@/types';

const page = usePage();
const activeRole = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    ),
);

const mainNavItems = computed<NavItem[]>(() => [
    {
        title: 'Panel',
        href: dashboard(),
        icon: LayoutGrid,
    },
    ...(activeRole.value?.role === 'administrator'
        ? [
              {
                  title: 'Usuarios y roles',
                  href: usersIndex(),
                  icon: UsersRound,
              },
              {
                  title: 'Estructura académica',
                  href: academicIndex('facultades'),
                  icon: Building2,
                  items: [
                      {
                          title: 'Facultades',
                          href: academicIndex('facultades'),
                      },
                      {
                          title: 'Carreras',
                          href: academicIndex('carreras'),
                      },
                      {
                          title: 'Campus',
                          href: academicIndex('campus'),
                      },
                      {
                          title: 'Modalidades',
                          href: academicIndex('modalidades'),
                      },
                      {
                          title: 'Periodos académicos',
                          href: academicIndex('periodos-academicos'),
                      },
                  ],
              },
              {
                  title: 'Coordinaciones',
                  href: coordinationsIndex(),
                  icon: ClipboardCheck,
              },
              {
                  title: 'Plantillas',
                  href: templatesIndex(),
                  icon: FileStack,
              },
              {
                  title: 'Trabajos asíncronos',
                  href: jobsIndex(),
                  icon: ListRestart,
              },
              {
                  title: 'Integración institucional',
                  href: integrationsIndex(),
                  icon: RefreshCcwDot,
              },
              {
                  title: 'Auditoría',
                  href: auditIndex(),
                  icon: ScrollText,
              },
          ]
        : []),
    ...(activeRole.value?.role === 'administrator'
        ? [
              {
                  title: 'Fuentes académicas',
                  href: sourcesIndex(),
                  icon: LibraryBig,
              },
          ]
        : []),
    ...(activeRole.value?.role === 'coordinator'
        ? [
              {
                  title: 'Mallas y materias',
                  href: curriculaIndex(),
                  icon: BookOpenCheck,
              },
              {
                  title: 'Oferta y paralelos',
                  href: offeringsIndex(),
                  icon: Building2,
              },
              {
                  title: 'Asignación docente',
                  href: teacherAssignmentsIndex(),
                  icon: UsersRound,
              },
              {
                  title: 'Fuentes académicas',
                  href: sourcesIndex(),
                  icon: LibraryBig,
              },
              {
                  title: 'Convocatorias',
                  href: convocationsIndex(),
                  icon: CalendarRange,
              },
              {
                  title: 'Revisión',
                  href: reviewsIndex(),
                  icon: ClipboardCheck,
              },
              {
                  title: 'Informes',
                  href: reportsIndex(),
                  icon: ChartNoAxesCombined,
              },
          ]
        : []),
    ...(activeRole.value?.role === 'teacher'
        ? [
              {
                  title: 'Mis sílabos',
                  href: syllabiIndex(),
                  icon: BookOpenCheck,
              },
          ]
        : []),
    ...(activeRole.value
        ? [
              {
                  title: 'Notificaciones',
                  href: notificationsIndex(),
                  icon: Bell,
                  badge: page.props.notifications.unread_count,
              },
          ]
        : []),
    // Solo tiene sentido para quien acumula roles; con uno solo no hay nada que elegir.
    ...(page.props.auth.roles.length > 1
        ? [
              {
                  title: 'Cambiar rol',
                  href: roleIndex(),
                  icon: Repeat2,
              },
          ]
        : []),
]);

const footerNavItems: NavItem[] = [];

// En móvil la barra lateral es un panel superpuesto: al elegir una opción tapa la página
// a la que se acaba de llegar. Se cierra al cambiar de ruta, y no en el clic de cada
// enlace, para que valga también para el pie, el logotipo y cualquier enlace futuro.
const { isMobile, setOpenMobile } = useSidebar();
const { currentUrl } = useCurrentUrl();

watch(currentUrl, () => {
    if (isMobile.value) {
        setOpenMobile(false);
    }
});
</script>

<template>
    <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" as-child>
                        <Link :href="dashboard()">
                            <AppLogo />
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
            <NavMain :items="mainNavItems" />
        </SidebarContent>

        <SidebarFooter>
            <NavFooter :items="footerNavItems" />
            <NavUser />
        </SidebarFooter>
    </Sidebar>
    <slot />
</template>
