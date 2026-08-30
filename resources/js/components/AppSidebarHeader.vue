<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { Bell } from '@lucide/vue';
import { computed } from 'vue';
import AppearanceToggle from '@/components/AppearanceToggle.vue';
import Breadcrumbs from '@/components/Breadcrumbs.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { saysTheSame } from '@/composables/usePageBreadcrumbs';
import { index as notificationsIndex } from '@/routes/notifications';
import type { BreadcrumbItem } from '@/types';

const props = withDefaults(
    defineProps<{
        breadcrumbs?: BreadcrumbItem[];
        /** Nombre de la pantalla abierta; lo entrega el marco de la página. */
        pageTitle?: string;
    }>(),
    {
        breadcrumbs: () => [],
        pageTitle: '',
    },
);

/**
 * La miga termina en el nombre de la pantalla, y solo se dice una vez.
 *
 * En un listado la última miga ya lo dice —«Procesos»—, así que no se añade nada. En un
 * detalle dice el módulo —«Usuarios»— y el nombre del registro se engancha detrás.
 */
const trail = computed<BreadcrumbItem[]>(() => {
    const crumbs = props.breadcrumbs;
    const last = crumbs.at(-1)?.title ?? '';

    if (props.pageTitle === '' || saysTheSame(last, props.pageTitle)) {
        return crumbs;
    }

    return [...crumbs, { title: props.pageTitle }];
});

const page = usePage();
const unreadCount = computed(() => page.props.notifications.unread_count ?? 0);
const isNotificationsPage = computed(
    () => page.component === 'Notifications/Index',
);
</script>

<template>
    <!--
        Fijo arriba: es lo que dice dónde está uno, y en una tabla larga era justo lo
        primero que se perdía. Lleva fondo propio porque el contenido pasa por debajo.
    -->
    <header
        class="sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-sidebar-border/70 bg-background px-6 pt-[env(safe-area-inset-top)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-[calc(3rem+env(safe-area-inset-top))] md:px-4"
    >
        <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <template v-if="trail.length > 0">
                <Breadcrumbs :breadcrumbs="trail" />
            </template>
        </div>
        <div class="ml-auto flex items-center gap-2">
            <Tooltip>
                <TooltipTrigger as-child>
                    <Button
                        as-child
                        :variant="isNotificationsPage ? 'secondary' : 'ghost'"
                        size="icon-sm"
                        class="relative"
                        aria-label="Notificaciones"
                        :aria-current="isNotificationsPage ? 'page' : undefined"
                    >
                        <Link :href="notificationsIndex()">
                            <Bell data-icon="inline-start" aria-hidden="true" />
                            <Badge
                                v-if="unreadCount > 0"
                                as="span"
                                class="absolute -top-1 -right-1 min-w-5 px-1"
                                aria-hidden="true"
                            >
                                {{ unreadCount > 99 ? '99+' : unreadCount }}
                            </Badge>
                        </Link>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Notificaciones</TooltipContent>
            </Tooltip>
            <AppearanceToggle />
        </div>
    </header>
</template>
