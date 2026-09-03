<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import { Info } from '@lucide/vue';
import { Controls } from '@vue-flow/controls';
import {
    ConnectionMode,
    MarkerType,
    useVueFlow,
    VueFlow,
} from '@vue-flow/core';
import type {
    Connection,
    Edge,
    EdgeMouseEvent,
    Node,
    NodeDragEvent,
    NodeMouseEvent,
} from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CurriculumAddSubjectNode from '@/components/domain/academic/curriculum/CurriculumAddSubjectNode.vue';
import CurriculumCycleNode from '@/components/domain/academic/curriculum/CurriculumCycleNode.vue';
import CurriculumLegend from '@/components/domain/academic/curriculum/CurriculumLegend.vue';
import CurriculumRequirementEdge from '@/components/domain/academic/curriculum/CurriculumRequirementEdge.vue';
import CurriculumSubjectNode from '@/components/domain/academic/curriculum/CurriculumSubjectNode.vue';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { formatNumericDisplay } from '@/lib/numberDisplay';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
} from '@/types/academic';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const props = defineProps<
    Pick<
        CurriculumBuilderProps,
        | 'curriculum'
        | 'fieldDefinitions'
        | 'fieldTotals'
        | 'subjects'
        | 'requirements'
        | 'career'
    > & {
        organizationUnits: string[];
        modalities: CurriculumBuilderProps['options']['modalities'];
    }
>();

// Paleta al estilo de la malla institucional: cada unidad de organización
// curricular recibe un color que comparten su franja de nivel y los encabezados
// ACD/APE/… de sus tarjetas. El orden sigue al listado alfabético de unidades.
const UNIT_PALETTE = [
    { backgroundColor: 'hsl(213 55% 47%)', color: 'hsl(0 0% 100%)' },
    { backgroundColor: 'hsl(210 52% 80%)', color: 'hsl(213 45% 18%)' },
    { backgroundColor: 'hsl(0 0% 74%)', color: 'hsl(0 0% 12%)' },
    { backgroundColor: 'hsl(31 62% 62%)', color: 'hsl(24 45% 16%)' },
    { backgroundColor: 'hsl(150 35% 55%)', color: 'hsl(152 45% 14%)' },
];
const FALLBACK_UNIT_STYLE = {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
};

const unitStyleFor = (
    unit: string | null | undefined,
): (typeof UNIT_PALETTE)[number] => {
    const index = props.organizationUnits.indexOf(unit?.trim() ?? '');

    return index === -1
        ? FALLBACK_UNIT_STYLE
        : UNIT_PALETTE[index % UNIT_PALETTE.length];
};

const ROMAN_NUMERALS = [
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1],
] as const;

const toRoman = (value: number): string => {
    let remaining = value;
    let roman = '';
    ROMAN_NUMERALS.forEach(([symbol, amount]) => {
        while (remaining >= amount) {
            roman += symbol;
            remaining -= amount;
        }
    });

    return roman || String(value);
};

// La unidad predominante del ciclo define el color de su franja lateral.
const dominantUnit = (
    cycleSubjects: CurriculumBuilderSubject[],
): string | null => {
    const counts = new Map<string, number>();
    cycleSubjects.forEach((subject) => {
        const unit = subject.organization_unit?.trim();

        if (unit) {
            counts.set(unit, (counts.get(unit) ?? 0) + 1);
        }
    });

    return [...counts.entries()].reduce<[string | null, number]>(
        (winner, [unit, count]) => (count > winner[1] ? [unit, count] : winner),
        [null, 0],
    )[0];
};

const summaryLabel = (fieldId: string, label: string): string =>
    props.fieldDefinitions.find((field) => field.id === fieldId)
        ?.system_label ?? label;

// La leyenda y el resumen se arman una sola vez y se reparten entre el panel de
// escritorio y el desplegable de móvil.
const legendUnits = computed(() =>
    props.organizationUnits.map((unit) => ({
        unit,
        style: unitStyleFor(unit),
    })),
);
const summaryRows = computed(() => [
    {
        id: 'subjects',
        label: 'N° asignaturas',
        value: String(props.subjects.length),
    },
    ...props.fieldTotals.map((total) => ({
        id: total.id,
        label: summaryLabel(total.id, total.label),
        value: formatNumericDisplay(total.value),
    })),
]);

const flowId = `curriculum-${props.curriculum.id}`;
const { setEdges, setNodes } = useVueFlow({ id: flowId });

// El carril se dibuja un 30 % más bajo que los 340 px originales; con menos aire
// sobrante, las tarjetas se centran en él en vez de colgar del borde superior.
const laneHeight = 238;
const laneInset = 16;
// En una carrera híbrida la tarjeta lleva además la etiqueta de modalidad: crece y se
// vuelve a centrar en el carril para no colgar del borde inferior.
const subjectHeight = computed(
    () => 110 + (props.career.modality?.per_subject ? 24 : 0),
);
const addSubjectHeight = 36;
const subjectOffset = computed(() =>
    Math.round((laneHeight - laneInset - subjectHeight.value) / 2),
);
const addSubjectOffset = Math.round(
    (laneHeight - laneInset - addSubjectHeight) / 2,
);
const laneStart = 145;
const subjectStep = 290;
const editorStep = 610;
const editingSubjectId = ref<string | null>(null);
const draftCycle = ref<number | null>(null);
const hasOpenEditor = computed(
    () => editingSubjectId.value !== null || draftCycle.value !== null,
);

const subjectsForCycle = (cycle: number): CurriculumBuilderSubject[] =>
    props.subjects
        .filter((subject) => subject.cycle === cycle)
        .sort((left, right) =>
            left.position === right.position
                ? left.name.localeCompare(right.name)
                : left.position - right.position,
        );

const laneWidth = computed(() => {
    const widestCycle = Array.from(
        { length: props.curriculum.cycle_count },
        (_, index) => {
            const cycle = index + 1;
            const subjectsWidth = subjectsForCycle(cycle).reduce(
                (width, subject) =>
                    width +
                    (editingSubjectId.value === subject.id
                        ? editorStep
                        : subjectStep),
                laneStart,
            );
            const creationWidth = props.curriculum.editable
                ? draftCycle.value === cycle
                    ? editorStep
                    : subjectStep
                : 0;

            return subjectsWidth + creationWidth;
        },
    ).reduce((widest, width) => Math.max(widest, width), 0);

    // Los 200px extra reservan espacio para las columnas de totales del nivel.
    return Math.max(1120, widestCycle + 200);
});

const subjectById = computed(
    () => new Map(props.subjects.map((subject) => [subject.id, subject])),
);

const beginSubjectEdit = (subjectId: string): void => {
    draftCycle.value = null;
    editingSubjectId.value = subjectId;
};

const beginSubjectCreation = (cycle: number): void => {
    editingSubjectId.value = null;
    draftCycle.value = cycle;
};

const closeEditor = (): void => {
    editingSubjectId.value = null;
    draftCycle.value = null;
};

const buildNodes = (): Node[] => {
    const nodes: Node[] = [];

    for (let cycle = 1; cycle <= props.curriculum.cycle_count; cycle += 1) {
        const cycleSubjects = subjectsForCycle(cycle);
        nodes.push({
            id: `cycle-${cycle}`,
            type: 'cycle',
            position: { x: 0, y: (cycle - 1) * laneHeight },
            data: {
                cycle,
                level: toRoman(cycle),
                unit: dominantUnit(cycleSubjects),
                unitStyle: unitStyleFor(dominantUnit(cycleSubjects)),
                subjectCount: cycleSubjects.length,
                totalHours: cycleSubjects.reduce(
                    (total, subject) => total + (subject.total_hours ?? 0),
                    0,
                ),
            },
            draggable: false,
            selectable: false,
            connectable: false,
            focusable: false,
            style: {
                width: `${laneWidth.value}px`,
                height: `${laneHeight - laneInset}px`,
            },
            zIndex: -1,
        });

        let x = laneStart;
        cycleSubjects.forEach((subject) => {
            const editing = editingSubjectId.value === subject.id;
            nodes.push({
                id: subject.id,
                type: 'subject',
                position: {
                    x,
                    y: (cycle - 1) * laneHeight + subjectOffset.value,
                },
                data: {
                    career: props.career,
                    modalities: props.modalities,
                    curriculum: props.curriculum,
                    fieldDefinitions: props.fieldDefinitions,
                    organizationUnits: props.organizationUnits,
                    subject,
                    unitStyle: unitStyleFor(subject.organization_unit),
                    cycle,
                    position: subject.position,
                    editable: props.curriculum.editable,
                    draggable:
                        props.curriculum.editable && !hasOpenEditor.value,
                    editing,
                    onEdit: () => beginSubjectEdit(subject.id),
                    onCancel: closeEditor,
                    onSaved: closeEditor,
                },
                draggable: props.curriculum.editable && !hasOpenEditor.value,
                connectable: props.curriculum.editable && !hasOpenEditor.value,
                selectable: false,
                // El formulario en línea es más alto que la tarjeta e invade la fila de
                // abajo: el nodo en edición se pinta por encima de todos los demás.
                zIndex: editing ? 1000 : 0,
            });
            x += editing ? editorStep : subjectStep;
        });

        if (!props.curriculum.editable) {
            continue;
        }

        if (draftCycle.value === cycle) {
            const position =
                Math.max(
                    -1,
                    ...cycleSubjects.map((subject) => subject.position),
                ) + 1;
            nodes.push({
                id: `draft-subject-${cycle}`,
                type: 'subject',
                position: {
                    x,
                    y: (cycle - 1) * laneHeight + subjectOffset.value,
                },
                data: {
                    career: props.career,
                    modalities: props.modalities,
                    curriculum: props.curriculum,
                    fieldDefinitions: props.fieldDefinitions,
                    organizationUnits: props.organizationUnits,
                    subject: null,
                    unitStyle: FALLBACK_UNIT_STYLE,
                    cycle,
                    position,
                    editable: true,
                    draggable: false,
                    editing: true,
                    onEdit: () => undefined,
                    onCancel: closeEditor,
                    onSaved: closeEditor,
                },
                draggable: false,
                connectable: false,
                zIndex: 1000,
                selectable: false,
            });
        } else {
            nodes.push({
                id: `add-subject-${cycle}`,
                type: 'addSubject',
                position: {
                    x,
                    y: (cycle - 1) * laneHeight + addSubjectOffset,
                },
                data: {
                    cycle,
                    disabled: hasOpenEditor.value,
                },
                draggable: false,
                selectable: false,
                connectable: false,
            });
        }
    }

    return nodes;
};

// Reparte las conexiones que comparten conector. La primera se queda en el centro de
// la materia —que es de donde se espera que salga una línea— y las siguientes se
// apartan hacia un lado para no pisarla.
const EDGE_SPACING = 18;

const edgeOffsets = (): Map<string, { source: number; target: number }> => {
    const orderKey = (subjectId: string): number => {
        const subject = subjectById.value.get(subjectId);

        return subject ? (subject.cycle ?? 0) * 1000 + subject.position : 0;
    };
    const groupOffsets = (
        groupBy: (requirement: (typeof props.requirements)[number]) => string,
        counterpart: (
            requirement: (typeof props.requirements)[number],
        ) => string,
    ): Map<string, number> => {
        const groups = new Map<string, typeof props.requirements>();
        props.requirements.forEach((requirement) => {
            const key = groupBy(requirement);
            groups.set(key, [...(groups.get(key) ?? []), requirement]);
        });
        const offsets = new Map<string, number>();
        groups.forEach((group) => {
            [...group]
                .sort(
                    (left, right) =>
                        orderKey(counterpart(left)) -
                        orderKey(counterpart(right)),
                )
                .forEach((requirement, index) => {
                    offsets.set(requirement.id, index * EDGE_SPACING);
                });
        });

        return offsets;
    };

    const sourceOffsets = groupOffsets(
        (requirement) => requirement.requirement_id,
        (requirement) => requirement.subject_id,
    );
    const targetOffsets = groupOffsets(
        (requirement) => requirement.subject_id,
        (requirement) => requirement.requirement_id,
    );

    return new Map(
        props.requirements.map((requirement) => [
            requirement.id,
            {
                source: sourceOffsets.get(requirement.id) ?? 0,
                target: targetOffsets.get(requirement.id) ?? 0,
            },
        ]),
    );
};

const buildEdges = (): Edge[] => {
    const offsets = edgeOffsets();

    return props.requirements.map((requirement) => {
        const color =
            requirement.type === 'correquisito'
                ? 'var(--primary)'
                : 'var(--destructive)';

        return {
            id: requirement.id,
            source: requirement.requirement_id,
            target: requirement.subject_id,
            type: 'requirement',
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color,
                width: 16,
                height: 16,
            },
            style: { stroke: color, strokeWidth: 2 },
            data: {
                label:
                    requirement.type === 'correquisito'
                        ? 'Correquisito'
                        : 'Prerrequisito',
                sourceOffset: offsets.get(requirement.id)?.source ?? 0,
                targetOffset: offsets.get(requirement.id)?.target ?? 0,
            },
        };
    });
};

const nodes = ref<Node[]>(buildNodes());
const edges = ref<Edge[]>(buildEdges());

watch(
    [
        () => props.subjects,
        () => props.requirements,
        () => props.organizationUnits,
        () => props.curriculum.cycle_count,
        editingSubjectId,
        draftCycle,
    ],
    () => {
        const nextNodes = buildNodes();
        const nextEdges = buildEdges();

        nodes.value = nextNodes;
        edges.value = nextEdges;
        setNodes(nextNodes);
        setEdges(nextEdges);
    },
    { deep: true },
);

const onNodeClick = ({ node }: NodeMouseEvent): void => {
    const cycle = node.data.cycle;

    if (
        node.type === 'addSubject' &&
        node.data.disabled !== true &&
        typeof cycle === 'number'
    ) {
        beginSubjectCreation(cycle);
    }
};

// La conexión no se guarda de inmediato: primero se pregunta el tipo, porque un
// mismo gesto de arrastre puede ser prerrequisito o correquisito.
const pendingConnection = ref<{ sourceId: string; targetId: string } | null>(
    null,
);
const savingRequirement = ref(false);
const subjectName = (id: string | null | undefined): string =>
    (id && subjectById.value.get(id)?.name) || 'materia';

const onConnect = (connection: Connection): void => {
    if (
        !props.curriculum.editable ||
        hasOpenEditor.value ||
        connection.source === null ||
        connection.target === null
    ) {
        return;
    }

    pendingConnection.value = {
        sourceId: connection.source,
        targetId: connection.target,
    };
};

const createRequirement = (type: 'prerrequisito' | 'correquisito'): void => {
    const pending = pendingConnection.value;

    if (!pending) {
        return;
    }

    savingRequirement.value = true;
    router.post(
        CareerAcademicStructureController.storeSubjectRequirement.url(
            props.curriculum.id,
        ),
        {
            requirement_id: pending.sourceId,
            subject_id: pending.targetId,
            type,
        },
        {
            preserveScroll: true,
            onError: (errors) =>
                toast.error(
                    String(
                        errors.requirement_id ??
                            errors.curriculum ??
                            'No se pudo crear la relación.',
                    ),
                ),
            onSuccess: () =>
                toast.success(
                    type === 'correquisito'
                        ? 'Correquisito agregado.'
                        : 'Prerrequisito agregado.',
                ),
            onFinish: () => {
                savingRequirement.value = false;
                pendingConnection.value = null;
            },
        },
    );
};

// Clic sobre una línea: permite revisar la relación y eliminarla si se creó mal.
const selectedRequirement = ref<(typeof props.requirements)[number] | null>(
    null,
);
const deletingRequirement = ref(false);

const onEdgeClick = ({ edge }: EdgeMouseEvent): void => {
    if (!props.curriculum.editable || hasOpenEditor.value) {
        return;
    }

    selectedRequirement.value =
        props.requirements.find((requirement) => requirement.id === edge.id) ??
        null;
};

const deleteRequirement = (): void => {
    const requirement = selectedRequirement.value;

    if (!requirement) {
        return;
    }

    deletingRequirement.value = true;
    router.delete(
        CareerAcademicStructureController.destroySubjectRequirement.url({
            curriculum: props.curriculum.id,
            requirement: requirement.id,
        }),
        {
            preserveScroll: true,
            onError: () => toast.error('No se pudo eliminar la relación.'),
            onSuccess: () => toast.success('Relación académica eliminada.'),
            onFinish: () => {
                deletingRequirement.value = false;
                selectedRequirement.value = null;
            },
        },
    );
};

const onNodeDragStop = ({ node }: NodeDragEvent): void => {
    if (
        !props.curriculum.editable ||
        node.type !== 'subject' ||
        !subjectById.value.has(node.id)
    ) {
        return;
    }

    const subject = subjectById.value.get(node.id);

    if (!subject) {
        return;
    }

    const cycle = Math.min(
        props.curriculum.cycle_count,
        Math.max(
            1,
            Math.round((node.position.y - subjectOffset.value) / laneHeight) +
                1,
        ),
    );
    const position = Math.max(
        0,
        Math.round((node.position.x - laneStart) / subjectStep),
    );

    if (subject.cycle === cycle && subject.position === position) {
        nodes.value = buildNodes();

        return;
    }

    router.patch(
        CareerAcademicStructureController.updateSubjectLayout.url(
            props.curriculum.id,
        ),
        { subject_id: node.id, cycle, position },
        {
            preserveScroll: true,
            onError: (errors) => {
                nodes.value = buildNodes();
                toast.error(
                    String(errors.cycle ?? 'No se pudo mover la materia.'),
                );
            },
        },
    );
};
</script>

<template>
    <div
        class="relative h-[72vh] min-h-[34rem] overflow-hidden rounded-lg border bg-background shadow-surface"
        aria-label="Modo interactivo de la malla"
    >
        <!--
            Panel al estilo del pie de la malla institucional: leyenda de
            relaciones y de unidades de organización curricular, más el resumen de
            totales de la malla completa. En móvil taparía media malla, así que
            ahí se repliega tras un botón y se consulta cuando hace falta.
        -->
        <div
            class="absolute top-3 right-3 z-10 max-w-56 rounded-md bg-card/90 px-3 py-2 text-card-foreground shadow-surface ring-1 ring-surface-ring max-sm:hidden"
        >
            <CurriculumLegend :units="legendUnits" :rows="summaryRows" />
        </div>
        <Popover>
            <PopoverTrigger as-child>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    class="absolute top-3 right-3 z-10 bg-card sm:hidden"
                    aria-label="Ver leyenda y totales de la malla"
                >
                    <Info aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-60 p-3">
                <CurriculumLegend :units="legendUnits" :rows="summaryRows" />
            </PopoverContent>
        </Popover>
        <VueFlow
            :id="flowId"
            v-model:nodes="nodes"
            v-model:edges="edges"
            fit-view-on-init
            :min-zoom="0.2"
            :max-zoom="1.5"
            :connection-mode="ConnectionMode.Loose"
            :nodes-draggable="curriculum.editable && !hasOpenEditor"
            :nodes-connectable="curriculum.editable && !hasOpenEditor"
            :elements-selectable="true"
            @connect="onConnect"
            @edge-click="onEdgeClick"
            @node-click="onNodeClick"
            @node-drag-stop="onNodeDragStop"
        >
            <template #edge-requirement="edgeProps">
                <CurriculumRequirementEdge v-bind="edgeProps" />
            </template>
            <template #node-cycle="nodeProps">
                <CurriculumCycleNode :data="nodeProps.data" />
            </template>
            <template #node-subject="nodeProps">
                <CurriculumSubjectNode
                    :data="nodeProps.data"
                    :dragging="nodeProps.dragging"
                />
            </template>
            <template #node-addSubject="nodeProps">
                <CurriculumAddSubjectNode
                    :data="nodeProps.data"
                    @add="beginSubjectCreation"
                />
            </template>
            <Controls
                position="bottom-left"
                :show-fit-view="false"
                :show-interactive="false"
            />
            <Dialog
                :open="pendingConnection !== null"
                @update:open="
                    (isOpen) => {
                        if (!isOpen) pendingConnection = null;
                    }
                "
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nueva relación académica</DialogTitle>
                        <DialogDescription>
                            «{{ subjectName(pendingConnection?.sourceId) }}» →
                            «{{ subjectName(pendingConnection?.targetId) }}».
                            Prerrequisito: debe aprobarse antes. Correquisito:
                            se cursan a la vez.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose as-child>
                            <Button
                                type="button"
                                variant="outline"
                                :disabled="savingRequirement"
                            >
                                Cancelar
                            </Button>
                        </DialogClose>
                        <Button
                            type="button"
                            variant="secondary"
                            :disabled="savingRequirement"
                            @click="createRequirement('correquisito')"
                        >
                            Correquisito
                        </Button>
                        <Button
                            type="button"
                            :disabled="savingRequirement"
                            @click="createRequirement('prerrequisito')"
                        >
                            Prerrequisito
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                :open="selectedRequirement !== null"
                @update:open="
                    (isOpen) => {
                        if (!isOpen) selectedRequirement = null;
                    }
                "
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {{
                                selectedRequirement?.type === 'correquisito'
                                    ? 'Correquisito'
                                    : 'Prerrequisito'
                            }}
                        </DialogTitle>
                        <DialogDescription>
                            «{{
                                subjectName(
                                    selectedRequirement?.requirement_id,
                                )
                            }}» → «{{
                                subjectName(selectedRequirement?.subject_id)
                            }}». Si la relación se creó por error, puede
                            eliminarla; las materias no se modifican.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose as-child>
                            <Button
                                type="button"
                                variant="outline"
                                :disabled="deletingRequirement"
                            >
                                Cancelar
                            </Button>
                        </DialogClose>
                        <Button
                            type="button"
                            variant="destructive"
                            :disabled="deletingRequirement"
                            @click="deleteRequirement"
                        >
                            <Spinner
                                v-if="deletingRequirement"
                                data-icon="inline-start"
                            />
                            Eliminar relación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <MiniMap
                class="max-sm:hidden"
                pannable
                zoomable
                node-color="var(--muted)"
                node-stroke-color="var(--border)"
                mask-color="color-mix(in srgb, var(--background) 65%, transparent)"
            />
        </VueFlow>
    </div>
</template>

<style scoped>
:deep(.vue-flow) {
    background-color: color-mix(in srgb, var(--background) 90%, black);
}

:deep(.vue-flow__minimap) {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    background-color: var(--card);
}

:deep(.vue-flow__controls) {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    box-shadow: none;
}

:deep(.vue-flow__controls-button) {
    border-bottom: 1px solid var(--border);
    background-color: var(--card);
    color: var(--foreground);
}

:deep(.vue-flow__controls-button:last-child) {
    border-bottom: none;
}

:deep(.vue-flow__controls-button:hover) {
    background-color: var(--accent);
}

:deep(.vue-flow__controls-button svg) {
    fill: currentColor;
}
</style>
