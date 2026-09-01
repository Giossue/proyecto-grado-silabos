<script setup lang="ts">
import { computed } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/composables/useInitials';
import type { User } from '@/types';

type Props = {
    user: User;
    showEmail?: boolean;
    subtitle?: string | null;
};

const props = withDefaults(defineProps<Props>(), {
    showEmail: false,
});

const { getInitials } = useInitials();

// Compute whether we should show the avatar image
const showAvatar = computed(
    () => props.user.avatar && props.user.avatar !== '',
);
</script>

<template>
    <Avatar class="size-8 overflow-hidden rounded-lg">
        <AvatarImage
            v-if="showAvatar"
            :src="user.avatar!"
            :alt="user.nombre"
        />
        <AvatarFallback class="rounded-lg text-black dark:text-white">
            {{ getInitials(user.nombre) }}
        </AvatarFallback>
    </Avatar>

    <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-medium">{{ user.nombre }}</span>
        <span
            v-if="subtitle || showEmail"
            class="truncate text-xs text-muted-foreground"
        >
            {{ subtitle ?? user.correo_electronico }}
        </span>
    </div>
</template>
