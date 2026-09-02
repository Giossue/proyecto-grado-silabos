<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { Eye, Lock, Pencil } from '@lucide/vue';
import { ref } from 'vue';
import AcademicSourceEditSheet from '@/components/domain/configuration/AcademicSourceEditSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { show as sourceShow } from '@/routes/sources';

/*
 * Menú de tres puntos de cada fuente: ver y editar, como el resto de tablas. Con una
 * convocatoria en curso la edición se explica en lugar de desaparecer.
 */
defineProps<{
    source: {
        id: string;
        name: string;
        description: string | null;
        internal_notes: string | null;
    };
    locked: boolean;
}>();

const editOpen = ref(false);
</script>

<template>
    <TableActionsMenu :label="`Acciones para ${source.name}`">
        <DropdownMenuItem as-child>
            <Link :href="sourceShow(source.id)">
                <Eye aria-hidden="true" />
                Ver fuente
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem v-if="!locked" @select="editOpen = true">
            <Pencil aria-hidden="true" />
            Editar
        </DropdownMenuItem>
        <DropdownMenuItem v-else disabled>
            <Lock aria-hidden="true" />
            Protegida durante la convocatoria
        </DropdownMenuItem>
    </TableActionsMenu>

    <AcademicSourceEditSheet
        v-model:open="editOpen"
        :source="source"
        display="menu"
    />
</template>
