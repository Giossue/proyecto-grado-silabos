<script setup lang="ts">
import { computed } from 'vue';
import AppearanceToggle from '@/components/AppearanceToggle.vue';
import Breadcrumbs from '@/components/Breadcrumbs.vue';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { saysTheSame } from '@/composables/usePageBreadcrumbs';
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
</script>

<template>
    <!--
        Fijo arriba: es lo que dice dónde está uno, y en una tabla larga era justo lo
        primero que se perdía. Lleva fondo propio porque el contenido pasa por debajo.
    -->
    <header
        class="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/70 bg-background px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4"
    >
        <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <template v-if="trail.length > 0">
                <Breadcrumbs :breadcrumbs="trail" />
            </template>
        </div>
        <div class="ml-auto flex items-center gap-2">
            <AppearanceToggle />
        </div>
    </header>
</template>
