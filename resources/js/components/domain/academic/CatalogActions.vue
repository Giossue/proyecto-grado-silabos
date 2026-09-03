<script setup lang="ts">
import { Pencil, UserRoundCog } from '@lucide/vue';
import { ref } from 'vue';
import CatalogEditSheet from '@/components/domain/academic/CatalogEditSheet.vue';
import CoordinatorReplacementSheet from '@/components/domain/academic/CoordinatorReplacementSheet.vue';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type {
    CatalogRecord,
    GovernanceCatalogEntity,
    Option,
} from '@/types/academic';

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
    /** Solo carreras: coordinación vigente y cuentas que pueden asumirla. */
    coordinator?: { id: string; name: string } | null;
    coordinatorUsers?: Option[];
}>();

const editOpen = ref(false);
const coordinatorOpen = ref(false);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordName}`">
            <DropdownMenuItem @select="editOpen = true">
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="entity === 'carrera' && active"
                @select="coordinatorOpen = true"
            >
                <UserRoundCog aria-hidden="true" />
                {{
                    coordinator
                        ? 'Reemplazar coordinador'
                        : 'Asignar coordinador'
                }}
            </DropdownMenuItem>
            <RecordStatusForm
                display="menu"
                scope="governance"
                :entity="entity"
                :record-id="recordId"
                :active="active"
            />
        </TableActionsMenu>

        <CoordinatorReplacementSheet
            v-if="entity === 'carrera'"
            :key="`coordinator-${recordId}`"
            v-model:open="coordinatorOpen"
            :career-id="recordId"
            :career-name="recordName"
            :coordinator="coordinator ?? null"
            :users="coordinatorUsers ?? []"
        />

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
