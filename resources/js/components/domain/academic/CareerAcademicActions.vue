<script setup lang="ts">
import { LockKeyhole, Pencil } from '@lucide/vue';
import { ref } from 'vue';
import CareerAcademicEditSheet from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import type {
    CareerAcademicEditableRecord,
    CareerAcademicEntity,
} from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { AcademicStructureProps } from '@/types/academic';

withDefaults(
    defineProps<{
        entity: CareerAcademicEntity;
        record: CareerAcademicEditableRecord;
        recordLabel: string;
        editable: boolean;
        active?: boolean;
        statusSupported?: boolean;
        lockedLabel?: string;
        options: AcademicStructureProps['options'];
    }>(),
    {
        active: true,
        statusSupported: true,
        lockedLabel: 'Con historial: archive y cree otro registro',
    },
);

const editOpen = ref(false);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordLabel}`">
            <DropdownMenuItem v-if="editable" @select="editOpen = true">
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem v-else disabled>
                <LockKeyhole aria-hidden="true" />
                {{ lockedLabel }}
            </DropdownMenuItem>

            <slot />

            <RecordStatusForm
                v-if="statusSupported"
                display="menu"
                scope="career"
                :entity="entity"
                :record-id="record.id"
                :active="active"
            />
        </TableActionsMenu>

        <CareerAcademicEditSheet
            :key="record.id"
            v-model:open="editOpen"
            :entity="entity"
            :record="record"
            :options="options"
        />
    </div>
</template>
