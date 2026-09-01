<script setup lang="ts">
import { Pencil } from '@lucide/vue';
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import CurriculumVisualSubjectForm from '@/components/domain/academic/curriculum/CurriculumVisualSubjectForm.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

const formatFieldValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? String(numeric) : String(value);
};

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
            class="relative w-64 overflow-hidden rounded-md border-2 bg-card text-card-foreground shadow-surface data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
            :data-selected="selected"
            :aria-label="`${data.subject.code}: ${data.subject.name}`"
        >
            <Button
                v-if="data.editable"
                type="button"
                size="icon-sm"
                variant="ghost"
                class="nodrag nopan absolute top-1 right-1"
                :aria-label="`Editar ${data.subject.name}`"
                @click.stop="data.onEdit"
            >
                <Pencil aria-hidden="true" />
            </Button>

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
                            class="bg-primary px-1 py-1 text-[0.6rem] font-semibold text-primary-foreground"
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
                        class="bg-primary px-1 py-1 text-[0.6rem] font-semibold text-primary-foreground"
                    >
                        {{ field.label }}
                    </dt>
                    <dd class="px-1 py-1 text-xs font-medium">
                        {{ formatFieldValue(field.value) }}
                    </dd>
                </div>
            </dl>
        </article>
        <Handle
            type="source"
            :position="Position.Bottom"
            :connectable="data.editable"
            aria-label="Crear relación académica"
        />
    </template>
</template>
