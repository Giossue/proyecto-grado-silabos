<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { Palette, ShieldCheck, UserRound } from '@lucide/vue';
import { computed } from 'vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { useSettingsRoutes } from '@/composables/useSettingsRoutes';
import { toUrl } from '@/lib/utils';
import type { NavItem } from '@/types';

const settings = useSettingsRoutes();
const sidebarNavItems = computed<NavItem[]>(() => [
    {
        title: 'Perfil',
        href: settings.profile.value,
        icon: UserRound,
    },
    {
        title: 'Seguridad',
        href: settings.security.value,
        icon: ShieldCheck,
    },
    {
        title: 'Apariencia',
        href: settings.appearance.value,
        icon: Palette,
    },
]);

const { isCurrentOrParentUrl } = useCurrentUrl();
</script>

<template>
    <PageFrame
        title="Configuración"
        description="Administre su perfil, seguridad y preferencias visuales."
    >
        <div class="flex flex-col gap-6 lg:flex-row lg:gap-12">
            <aside class="w-full max-w-xl lg:w-48">
                <nav class="flex flex-col gap-1" aria-label="Configuración">
                    <Button
                        v-for="item in sidebarNavItems"
                        :key="toUrl(item.href)"
                        variant="ghost"
                        :class="[
                            'w-full justify-start',
                            { 'bg-muted': isCurrentOrParentUrl(item.href) },
                        ]"
                        as-child
                    >
                        <Link :href="item.href">
                            <component :is="item.icon" class="size-4" />
                            {{ item.title }}
                        </Link>
                    </Button>
                </nav>
            </aside>

            <Separator class="my-6 lg:hidden" />

            <div class="flex-1 md:max-w-2xl">
                <section class="flex max-w-xl flex-col gap-12">
                    <slot />
                </section>
            </div>
        </div>
    </PageFrame>
</template>
