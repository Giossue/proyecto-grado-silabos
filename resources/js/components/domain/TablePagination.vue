<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import type { PaginationMeta } from '@/types/pagination';

const props = withDefaults(
    defineProps<{
        meta: PaginationMeta;
        mode?: 'client' | 'server';
        label?: string;
    }>(),
    {
        mode: 'server',
        label: 'Paginación de la tabla',
    },
);

const emit = defineEmits<{
    'update:page': [page: number];
}>();

const changePage = (page: number): void => {
    if (
        page === props.meta.current_page ||
        page < 1 ||
        page > props.meta.last_page
    ) {
        return;
    }

    if (props.mode === 'client') {
        emit('update:page', page);

        return;
    }

    const link = props.meta.links?.find((item) => item.label === String(page));

    if (link?.url) {
        router.visit(link.url, {
            preserveScroll: true,
            preserveState: true,
        });
    }
};
</script>

<template>
    <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
        <p class="text-sm text-muted-foreground" aria-live="polite">
            {{ meta.from ?? 0 }}–{{ meta.to ?? 0 }} de {{ meta.total }}
        </p>

        <Pagination
            :page="meta.current_page"
            :total="meta.total"
            :items-per-page="meta.per_page"
            :sibling-count="1"
            show-edges
            :aria-label="label"
            class="mx-0 w-auto justify-start sm:justify-end"
            @update:page="changePage"
        >
            <PaginationContent v-slot="{ items }">
                <PaginationPrevious aria-label="Página anterior">
                    <ChevronLeft aria-hidden="true" />
                    <span class="hidden sm:inline">Anterior</span>
                </PaginationPrevious>

                <template v-for="(item, index) in items" :key="index">
                    <PaginationItem
                        v-if="item.type === 'page'"
                        :value="item.value"
                        :is-active="item.value === meta.current_page"
                        :aria-label="`Ir a la página ${item.value}`"
                    >
                        {{ item.value }}
                    </PaginationItem>
                    <PaginationEllipsis v-else />
                </template>

                <PaginationNext aria-label="Página siguiente">
                    <span class="hidden sm:inline">Siguiente</span>
                    <ChevronRight aria-hidden="true" />
                </PaginationNext>
            </PaginationContent>
        </Pagination>
    </div>
</template>
