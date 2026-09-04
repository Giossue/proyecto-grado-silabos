<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Pencil, Trash2, UserRoundCog } from '@lucide/vue';
import { ref } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import CatalogEditSheet from '@/components/domain/academic/CatalogEditSheet.vue';
import CoordinatorReplacementSheet from '@/components/domain/academic/CoordinatorReplacementSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
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
    lockReason?: string | null;
}>();

const editOpen = ref(false);
const coordinatorOpen = ref(false);
const deleteOpen = ref(false);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordName}`">
            <DropdownMenuItem v-if="!lockReason" @select="editOpen = true">
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem v-else disabled>
                <LockKeyhole aria-hidden="true" />
                {{ lockReason }}
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="entity === 'carrera' && active && !lockReason"
                @select="coordinatorOpen = true"
            >
                <UserRoundCog aria-hidden="true" />
                {{
                    coordinator
                        ? 'Reemplazar coordinador'
                        : 'Asignar coordinador'
                }}
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="!lockReason"
                variant="destructive"
                @select="deleteOpen = true"
            >
                <Trash2 aria-hidden="true" />
                Eliminar
            </DropdownMenuItem>
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

        <Dialog v-model:open="deleteOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Eliminar registro institucional</DialogTitle>
                    <DialogDescription>
                        Se eliminará «{{ recordName }}». La operación se
                        rechazará si tiene carreras, ofertas, procesos u otro
                        historial relacionado.
                    </DialogDescription>
                </DialogHeader>
                <Form
                    v-bind="
                        AcademicGovernanceController.destroy.form({
                            entity,
                            record: recordId,
                        })
                    "
                    v-slot="{ errors, processing }"
                    @success="deleteOpen = false"
                >
                    <p
                v-if="errors.record || errors.process"
                        class="mb-4 text-sm text-destructive"
                    >
                        {{ errors.record || errors.process }}
                    </p>
                    <DialogFooter>
                        <DialogClose as-child>
                            <Button type="button" variant="outline">
                                Cancelar
                            </Button>
                        </DialogClose>
                        <Button
                            type="submit"
                            variant="destructive"
                            :disabled="processing"
                        >
                            <Spinner v-if="processing" />
                            Eliminar registro
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
</template>
