<script setup lang="ts">
import { usePage } from '@inertiajs/vue3';
import { ChevronsUpDown } from '@lucide/vue';
import { computed, ref } from 'vue';
import WorkScopeSwitcherSheet from '@/components/domain/identity/WorkScopeSwitcherSheet.vue';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import UserInfo from '@/components/UserInfo.vue';
import UserMenuContent from '@/components/UserMenuContent.vue';

const page = usePage();
const user = computed(() => page.props.auth.user);
const activeRole = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    ),
);
const canSwitchScope = computed(() => page.props.auth.roles.length > 1);
const switcherOpen = ref(false);
const { isMobile, state } = useSidebar();
</script>

<template>
    <SidebarMenu>
        <SidebarMenuItem>
            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <SidebarMenuButton
                        size="lg"
                        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        data-test="sidebar-menu-button"
                    >
                        <UserInfo
                            :user="user"
                            :subtitle="
                                activeRole?.career_name ?? activeRole?.role_name
                            "
                        />
                        <ChevronsUpDown class="ml-auto" />
                    </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                    :side="
                        isMobile
                            ? 'bottom'
                            : state === 'collapsed'
                              ? 'left'
                              : 'bottom'
                    "
                    align="end"
                    :side-offset="4"
                >
                    <UserMenuContent
                        :user="user"
                        :can-switch-scope="canSwitchScope"
                        @switch-scope="switcherOpen = true"
                    />
                </DropdownMenuContent>
            </DropdownMenu>
            <WorkScopeSwitcherSheet v-model:open="switcherOpen" />
        </SidebarMenuItem>
    </SidebarMenu>
</template>
