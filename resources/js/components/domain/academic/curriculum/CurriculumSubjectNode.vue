<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Pencil, Trash2 } from '@lucide/vue';
import { Handle, Position } from '@vue-flow/core';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CurriculumVisualSubjectForm from '@/components/domain/academic/curriculum/CurriculumVisualSubjectForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { Badge } from '@/components/ui/badge';
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
import { formatNumericDisplay } from '@/lib/numberDisplay';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
    CurriculumFieldDefinition,
} from '@/types/academic';

const props = defineProps<{
    data: {
        curriculum: CurriculumBuilderProps['curriculum'];
        fieldDefinitions: CurriculumFieldDefinition[];
        organizationUnits: string[];
        subject: CurriculumBuilderSubject | null;
        unitStyle: { backgroundColor: string; color: string };
        cycle: number;
        position: number;
        editable: boolean;
        editing: boolean;
        onEdit: () => void;
        onCancel: () => void;
        onSaved: () => void;
    };
    selected?: boolean;
}>();

const deleteOpen = ref(false);

const formatFieldValue = formatNumericDisplay;

const totalFieldIds = computed(
    () =>
        new Set(
            props.data.fieldDefinitions
                .filter((field) => field.system_key === 'total_hours')
                .map((field) => field.id),
        ),
);

const regularFields = computed(
    () =>
        props.data.subject?.display_fields.filter(
            (field) => !totalFieldIds.value.has(field.id),
        ) ?? [],
);

const totalFields = computed(
    () =>
        props.data.subject?.display_fields.filter((field) =>
            totalFieldIds.value.has(field.id),
        ) ?? [],
);
</script>

<template>
    <CurriculumVisualSubjectForm
        v-if="data.editing"
        :curriculum="data.curriculum"
        :field-definitions="data.fieldDefinitions"
        :organization-units="data.organizationUnits"
        :subject="data.subject"
        :cycle="data.cycle"
        :position="data.position"
        @cancel="data.onCancel"
        @saved="data.onSaved"
    />

    <template v-else-if="data.subject">
        <Handle
            type="target"
            :position="Position.Top"
            :connectable="data.editable"
            aria-label="Recibir relación académica"
        />
        <article
            class="relative w-64 overflow-hidden rounded-md bg-card text-card-foreground shadow-surface ring-1 ring-surface-ring data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
            :data-selected="selected"
            :aria-label="`${data.subject.code}: ${data.subject.name}`"
        >
            <div
                v-if="data.editable"
                class="nodrag nopan absolute top-1 right-1"
                @click.stop
                @mousedown.stop
            >
                <TableActionsMenu :label="`Acciones para ${data.subject.name}`">
                    <DropdownMenuItem @select="data.onEdit">
                        <Pencil aria-hidden="true" />
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        variant="destructive"
                        @select="deleteOpen = true"
                    >
                        <Trash2 aria-hidden="true" />
                        Eliminar
                    </DropdownMenuItem>
                </TableActionsMenu>
            </div>

            <div class="flex min-h-20">
                <div
                    class="flex w-9 shrink-0 items-center justify-center border-r bg-muted px-1 py-2"
                >
                    <span
                        class="-rotate-90 text-[0.65rem] font-semibold whitespace-nowrap"
                    >
                        {{ data.subject.code }}
                    </span>
                </div>
                <div
                    class="flex flex-1 flex-col items-center justify-center gap-2 p-3 pr-9 text-center"
                >
                    <Badge
                        v-if="data.subject.organization_unit"
                        variant="secondary"
                    >
                        {{ data.subject.organization_unit }}
                    </Badge>
                    <h3 class="text-xs leading-snug font-semibold uppercase">
                        {{ data.subject.name }}
                    </h3>
                </div>
            </div>

            <dl
                v-if="data.subject.display_fields.length > 0"
                class="border-t bg-muted/40"
            >
                <div
                    v-if="regularFields.length > 0"
                    class="grid"
                    :style="{
                        gridTemplateColumns: `repeat(${regularFields.length}, minmax(0, 1fr))`,
                    }"
                >
                    <div
                        v-for="field in regularFields"
                        :key="field.id"
                        class="border-r text-center last:border-r-0"
                    >
                        <dt
                            class="px-1 py-1 text-[0.6rem] font-semibold"
                            :style="data.unitStyle"
                        >
                            {{ field.label }}
                        </dt>
                        <dd class="px-1 py-1 text-xs font-medium">
                            {{ formatFieldValue(field.value) }}
                        </dd>
                    </div>
                </div>
                <div
                    v-for="field in totalFields"
                    :key="field.id"
                    class="text-center"
                    :class="{ 'border-t': regularFields.length > 0 }"
                >
                    <dt
                        class="px-1 py-1 text-[0.6rem] font-semibold"
                        :style="data.unitStyle"
                    >
                        {{ field.label }}
                    </dt>
                    <dd class="px-1 py-1 text-xs font-medium">
                        {{ formatFieldValue(field.value) }}
                    </dd>
                </div>
            </dl>
        </article>

        <Dialog v-model:open="deleteOpen">
            <DialogContent class="nodrag nopan" @mousedown.stop @keydown.stop>
                <DialogHeader>
                    <DialogTitle>Eliminar materia</DialogTitle>
                    <DialogDescription>
                        Se eliminará «{{ data.subject.name }}» junto con sus
                        relaciones académicas. Esta acción solo se completará si
                        la materia no tiene ofertas ni sílabos relacionados.
                    </DialogDescription>
                </DialogHeader>

                <Form
                    v-bind="
                        CareerAcademicStructureController.destroySubject.form({
                            curriculum: data.curriculum.id,
                            subject: data.subject.id,
                        })
                    "
                    v-slot="{ errors, processing }"
                    :options="{ preserveScroll: true }"
                    @success="deleteOpen = false"
                >
                    <p
                        v-if="errors.subject"
                        class="mb-4 text-sm text-destructive"
                    >
                        {{ errors.subject }}
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
                            Eliminar materia
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
        <Handle
            type="source"
            :position="Position.Bottom"
            :connectable="data.editable"
            aria-label="Crear relación académica"
        />
    </template>
</template>
