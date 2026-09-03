<script setup lang="ts">
import { Pencil } from '@lucide/vue';
import { ref } from 'vue';
import CatalogEditSheet from '@/components/domain/academic/CatalogEditSheet.vue';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { CatalogRecord, GovernanceCatalogEntity } from '@/types/academic';

defineProps<{
    entity: GovernanceCatalogEntity;
    recordId: string;
    logoUrl?: string | null;
    recordName: string;
    recordCode: string | null;
    active: boolean;
    facultyId?: string | null;
    modality?: string | null;
    hybrid?: boolean;
    campusId?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
    faculties: CatalogRecord[];
    campuses?: CatalogRecord[];
}>();

const editOpen = ref(false);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordName}`">
            <DropdownMenuItem @select="editOpen = true">
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <RecordStatusForm
                display="menu"
                scope="governance"
                :entity="entity"
                :record-id="recordId"
                :active="active"
            />
        </TableActionsMenu>

        <!-- La clave depende solo del registro: si incluyera sus datos, al guardar
             cambiaría, Vue recrearía el panel con `editOpen` todavía en verdadero y
             volvería a abrirse. El contenido se desmonta al cerrar, así que al reabrir
             ya toma los valores actualizados. -->
        <CatalogEditSheet
            :key="recordId"
            v-model:open="editOpen"
            :entity="entity"
            :record-id="recordId"
            :record-name="recordName"
            :record-code="recordCode"
            :faculty-id="facultyId"
            :modality="modality"
            :hybrid="hybrid"
            :campus-id="campusId"
            :campuses="campuses"
            :logo-url="logoUrl"
            :starts-on="startsOn"
            :ends-on="endsOn"
            :faculties="faculties"
            :show-trigger="false"
        />
    </div>
</template>
