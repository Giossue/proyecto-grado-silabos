<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { ChevronRight } from '@lucide/vue';
import { computed } from 'vue';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import type { NavItem } from '@/types';

defineProps<{
    items: NavItem[];
}>();

const { isCurrentOrParentUrl } = useCurrentUrl();
const { state, isMobile } = useSidebar();

// Con el sidebar reducido a iconos no hay sitio para desplegar nada dentro: las
// opciones salen en un menú flotante y la barra se queda como está.
const showsFlyout = computed(
    () => state.value === 'collapsed' && !isMobile.value,
);

// Las pantallas de detalle cuelgan de la dirección de su sección, así que la
// comparación es por prefijo: la sección sigue marcada aunque la URL ya no sea
// exactamente la del índice.
const isItemActive = (item: NavItem): boolean =>
    item.isActive === true ||
    isCurrentOrParentUrl(item.href) ||
    (item.items?.some((child) => isCurrentOrParentUrl(child.href)) ?? false);
</script>

<template>
    <SidebarGroup class="px-2 py-0">
        <SidebarGroupLabel>Trabajo</SidebarGroupLabel>
        <SidebarMenu>
            <SidebarMenuItem v-for="item in items" :key="item.title">
                <template v-if="!item.items?.length">
                    <SidebarMenuButton
                        as-child
                        :is-active="isItemActive(item)"
                        :tooltip="item.title"
                    >
                        <Link :href="item.href">
                            <component :is="item.icon" />
                            <span>{{ item.title }}</span>
                        </Link>
                    </SidebarMenuButton>
                    <SidebarMenuBadge v-if="item.badge">
                        {{ item.badge > 99 ? '99+' : item.badge }}
                    </SidebarMenuBadge>
                </template>

                <DropdownMenu v-else-if="showsFlyout">
                    <DropdownMenuTrigger as-child>
                        <SidebarMenuButton
                            :is-active="isItemActive(item)"
                            :tooltip="item.title"
                        >
                            <component :is="item.icon" />
                            <span>{{ item.title }}</span>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="right"
                        align="start"
                        class="w-56"
                    >
                        <!--
                            Sin título: el menú sale pegado al icono que se acaba de
                            pulsar, así que repetirlo dentro solo estorba y hace que la
                            primera opción parezca un encabezado.
                        -->
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                v-for="child in item.items"
                                :key="child.title"
                                as-child
                            >
                                <Link :href="child.href">
                                    {{ child.title }}
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Collapsible
                    v-else
                    class="group/collapsible"
                    :default-open="isItemActive(item)"
                >
                    <CollapsibleTrigger as-child>
                        <SidebarMenuButton :is-active="isItemActive(item)">
                            <component :is="item.icon" />
                            <span>{{ item.title }}</span>
                            <ChevronRight
                                class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                                aria-hidden="true"
                            />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub>
                            <SidebarMenuSubItem
                                v-for="child in item.items"
                                :key="child.title"
                            >
                                <SidebarMenuSubButton
                                    as-child
                                    :is-active="
                                        isCurrentOrParentUrl(child.href)
                                    "
                                >
                                    <Link :href="child.href">
                                        <span>{{ child.title }}</span>
                                    </Link>
                                </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
            </SidebarMenuItem>
        </SidebarMenu>
    </SidebarGroup>
</template>
