<script setup lang="ts">
import { router } from '@inertiajs/vue3';
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
import CurriculumSubjectNode from '@/components/domain/academic/curriculum/CurriculumSubjectNode.vue';
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
        'curriculum' | 'fieldDefinitions' | 'subjects' | 'requirements'
    > & { organizationUnits: string[] }
>();

const flowId = `curriculum-${props.curriculum.id}`;
const { setEdges, setNodes } = useVueFlow({ id: flowId });

const laneHeight = 340;
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

    return Math.max(1120, widestCycle + 40);
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
                height: `${laneHeight - 16}px`,
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
                    y: (cycle - 1) * laneHeight + 38,
                },
                data: {
                    curriculum: props.curriculum,
                    fieldDefinitions: props.fieldDefinitions,
                    organizationUnits: props.organizationUnits,
                    subject,
                    cycle,
                    position: subject.position,
                    editable: props.curriculum.editable,
                    editing,
                    onEdit: () => beginSubjectEdit(subject.id),
                    onCancel: closeEditor,
                    onSaved: closeEditor,
                },
                draggable: props.curriculum.editable && !hasOpenEditor.value,
                connectable: props.curriculum.editable && !hasOpenEditor.value,
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
                    y: (cycle - 1) * laneHeight + 38,
                },
                data: {
                    curriculum: props.curriculum,
                    fieldDefinitions: props.fieldDefinitions,
                    organizationUnits: props.organizationUnits,
                    subject: null,
                    cycle,
                    position,
                    editable: true,
                    editing: true,
                    onEdit: () => undefined,
                    onCancel: closeEditor,
                    onSaved: closeEditor,
                },
                draggable: false,
                connectable: false,
            });
        } else {
            nodes.push({
                id: `add-subject-${cycle}`,
                type: 'addSubject',
                position: {
                    x,
                    y: (cycle - 1) * laneHeight + 98,
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

const buildEdges = (): Edge[] =>
    props.requirements.map((requirement) => ({
        id: requirement.id,
        source: requirement.requirement_id,
        target: requirement.subject_id,
        type: 'smoothstep',
        label:
            requirement.type === 'corequisite'
                ? 'Correquisito'
                : 'Prerrequisito',
        markerEnd: MarkerType.ArrowClosed,
        style: {
            stroke:
                requirement.type === 'corequisite'
                    ? 'var(--primary)'
                    : 'var(--destructive)',
            strokeWidth: 2,
        },
        labelStyle: { fill: 'var(--foreground)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--card)', stroke: 'var(--border)' },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
    }));

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

const onConnect = (connection: Connection): void => {
    if (
        !props.curriculum.editable ||
        hasOpenEditor.value ||
        connection.source === null ||
        connection.target === null
    ) {
        return;
    }

    router.post(
        CareerAcademicStructureController.storeSubjectRequirement.url(
            props.curriculum.id,
        ),
        {
            requirement_id: connection.source,
            subject_id: connection.target,
            type: 'prerequisite',
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
            onSuccess: () => toast.success('Prerrequisito agregado.'),
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
        Math.max(1, Math.round((node.position.y - 38) / laneHeight) + 1),
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
        class="h-[72vh] min-h-[34rem] overflow-hidden rounded-lg border bg-background shadow-surface"
        aria-label="Constructor visual de la malla"
    >
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
            @node-click="onNodeClick"
            @node-drag-stop="onNodeDragStop"
        >
            <template #node-cycle="nodeProps">
                <CurriculumCycleNode :data="nodeProps.data" />
            </template>
            <template #node-subject="nodeProps">
                <CurriculumSubjectNode
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>
            <template #node-addSubject="nodeProps">
                <CurriculumAddSubjectNode
                    :data="nodeProps.data"
                    @add="beginSubjectCreation"
                />
            </template>
            <Controls position="bottom-left" />
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
