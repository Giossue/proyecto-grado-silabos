<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import {
    BookOpenCheck,
    Building2,
    CalendarRange,
    ClipboardCheck,
    FileStack,
    LayoutGrid,
    LibraryBig,
    ChartNoAxesCombined,
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
import { dashboard as adminDashboard } from '@/routes/admin';
import { index as academicIndex } from '@/routes/admin/academic';
import { index as auditIndex } from '@/routes/admin/audit';
import { index as jobsIndex } from '@/routes/admin/jobs';
import { index as templatesIndex } from '@/routes/admin/templates';
import { index as usersIndex } from '@/routes/admin/users';
import { index as convocationsIndex } from '@/routes/convocations';
import { dashboard as coordinationDashboard } from '@/routes/coordination';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import { index as offeringsIndex } from '@/routes/coordination/academic/offerings';
import { index as parallelsIndex } from '@/routes/coordination/academic/parallels';
import { index as teacherAssignmentsIndex } from '@/routes/coordination/academic/teacher-assignments';
import { index as coordinationSourcesIndex } from '@/routes/coordination/sources';
import { index as reportsIndex } from '@/routes/reports';
import { index as reviewsIndex } from '@/routes/reviews';
import { index as syllabiIndex } from '@/routes/syllabi';
import { dashboard as teacherDashboard } from '@/routes/teacher';
import type { NavItem } from '@/types';

const page = usePage();
const activeRole = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    ),
);

/*
 * Las direcciones cortas (`/dashboard`, `/fuentes`) redirigen a la copia del área, así
 * que nunca coinciden con la URL final y el ítem jamás se marcaría como actual. La barra
 * ya sabe el rol activo, así que enlaza directo a la copia del área.
 */
const panelHref = computed(() => {
    switch (activeRole.value?.role) {
        case 'administrator':
            return adminDashboard();
        case 'coordinator':
            return coordinationDashboard();
        case 'teacher':
            return teacherDashboard();
        default:
            return dashboard();
    }
});

const mainNavItems = computed<NavItem[]>(() => [
    {
        title: 'Panel',
        href: panelHref.value,
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
                  // Sin sección: el `href` del grupo solo decide el marcado como
                  // actual, y así cubre también la dirección base sin pestaña.
                  title: 'Estructura académica',
                  href: academicIndex(),
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
                  title: 'Plantillas',
                  href: templatesIndex(),
                  icon: FileStack,
              },
              {
                  title: 'Auditoría',
                  href: auditIndex(),
                  icon: ScrollText,
                  items: [
                      {
                          title: 'Procesos',
                          href: jobsIndex(),
                      },
                      {
                          title: 'Registro de actividad',
                          href: auditIndex(),
                      },
                  ],
              },
          ]
        : []),
    ...(activeRole.value?.role === 'coordinator'
        ? [
              {
                  title: 'Malla',
                  href: curriculaIndex(),
                  icon: BookOpenCheck,
              },
              {
                  title: 'Ofertas y paralelos',
                  href: offeringsIndex(),
                  icon: Building2,
                  items: [
                      {
                          title: 'Ofertas',
                          href: offeringsIndex(),
                      },
                      {
                          title: 'Paralelos',
                          href: parallelsIndex(),
                      },
                  ],
              },
              {
                  title: 'Asignación docente',
                  href: teacherAssignmentsIndex(),
                  icon: UsersRound,
              },
              {
                  title: 'Fuentes académicas',
                  href: coordinationSourcesIndex(),
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
