<script setup lang="ts">
import { Link, router } from '@inertiajs/vue3';
import { Building2, LogOut, Settings } from '@lucide/vue';
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import UserInfo from '@/components/UserInfo.vue';
import { useSettingsRoutes } from '@/composables/useSettingsRoutes';
import { logout } from '@/routes';
import type { User } from '@/types';

type Props = {
    user: User;
    canSwitchScope?: boolean;
};

defineEmits<{ 'switch-scope': [] }>();

const handleLogout = () => {
    router.flushAll();
};

withDefaults(defineProps<Props>(), { canSwitchScope: false });

const settings = useSettingsRoutes();
</script>

<template>
    <DropdownMenuLabel class="p-0 font-normal">
        <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <UserInfo :user="user" :show-email="true" />
        </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
        <DropdownMenuItem v-if="canSwitchScope" @select="$emit('switch-scope')">
            <Building2 data-icon="inline-start" aria-hidden="true" />
            Cambiar carrera o rol
        </DropdownMenuItem>
        <DropdownMenuItem :as-child="true">
            <Link
                class="block w-full cursor-pointer"
                :href="settings.profile.value"
                prefetch
            >
                <Settings data-icon="inline-start" aria-hidden="true" />
                Configuración
            </Link>
        </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem :as-child="true">
        <Link
            class="block w-full cursor-pointer"
            :href="logout()"
            @click="handleLogout"
            as="button"
            data-test="logout-button"
        >
            <LogOut data-icon="inline-start" aria-hidden="true" />
            Cerrar sesión
        </Link>
    </DropdownMenuItem>
</template>
