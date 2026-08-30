<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import { Controls } from '@vue-flow/controls';
import { ConnectionMode, MarkerType, VueFlow } from '@vue-flow/core';
import type { Connection, Edge, Node, NodeDragEvent } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
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

const props =
    defineProps<
        Pick<CurriculumBuilderProps, 'curriculum' | 'subjects' | 'requirements'>
    >();

const emit = defineEmits<{
    edit: [subject: CurriculumBuilderSubject];
}>();

const laneHeight = 230;
const laneWidth = computed(() => {
    const largestCycle = Array.from(
        { length: props.curriculum.cycle_count },
        (_, index) =>
            props.subjects.filter((subject) => subject.cycle === index + 1)
                .length,
    ).reduce((largest, count) => Math.max(largest, count), 1);

    return Math.max(1120, 180 + largestCycle * 290);
});

const subjectById = computed(
    () => new Map(props.subjects.map((subject) => [subject.id, subject])),
);

const buildNodes = (): Node[] => {
    const nodes: Node[] = [];

    for (let cycle = 1; cycle <= props.curriculum.cycle_count; cycle += 1) {
        const cycleSubjects = props.subjects
            .filter((subject) => subject.cycle === cycle)
            .sort((left, right) =>
                left.position === right.position
                    ? left.name.localeCompare(right.name)
                    : left.position - right.position,
            );
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

        cycleSubjects.forEach((subject, index) => {
            nodes.push({
                id: subject.id,
                type: 'subject',
                position: {
                    x: 145 + index * 290,
                    y: (cycle - 1) * laneHeight + 38,
                },
                data: {
                    ...subject,
                    editable: props.curriculum.editable,
                    onEdit: (id: string) => {
                        const selected = subjectById.value.get(id);

                        if (selected) {
                            emit('edit', selected);
                        }
                    },
                },
                draggable: props.curriculum.editable,
                connectable: props.curriculum.editable,
            });
        });
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
    }));

const nodes = ref<Node[]>(buildNodes());
const edges = ref<Edge[]>(buildEdges());

watch(
    () => [props.subjects, props.requirements, props.curriculum.cycle_count],
    () => {
        nodes.value = buildNodes();
        edges.value = buildEdges();
    },
    { deep: true },
);

const onConnect = (connection: Connection): void => {
    if (
        !props.curriculum.editable ||
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
    if (!props.curriculum.editable || node.type !== 'subject') {
        return;
    }

    const cycle = Math.min(
        props.curriculum.cycle_count,
        Math.max(1, Math.round((node.position.y - 38) / laneHeight) + 1),
    );
    const position = Math.max(0, Math.round((node.position.x - 145) / 290));
    router.patch(
        CareerAcademicStructureController.updateSubjectLayout.url(
            props.curriculum.id,
        ),
        { subject_id: node.id, cycle, position },
        {
            preserveScroll: true,
            onError: (errors) =>
                toast.error(
                    String(errors.cycle ?? 'No se pudo mover la materia.'),
                ),
            onSuccess: () => toast.success('Materia reubicada.'),
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
            v-model:nodes="nodes"
            v-model:edges="edges"
            fit-view-on-init
            :min-zoom="0.2"
            :max-zoom="1.5"
            :connection-mode="ConnectionMode.Loose"
            :nodes-draggable="curriculum.editable"
            :nodes-connectable="curriculum.editable"
            :elements-selectable="true"
            @connect="onConnect"
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
            <Controls position="bottom-left" />
            <MiniMap class="max-sm:hidden" pannable zoomable />
        </VueFlow>
    </div>
</template>
