<script setup lang="ts">
import { Pencil } from '@lucide/vue';
import { Handle, Position } from '@vue-flow/core';
import { NodeToolbar } from '@vue-flow/node-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CurriculumBuilderSubject } from '@/types/academic';

defineProps<{
    data: CurriculumBuilderSubject & {
        editable: boolean;
        onEdit: (id: string) => void;
    };
    selected?: boolean;
}>();
</script>

<template>
    <NodeToolbar :is-visible="selected" :position="Position.Right">
        <Button
            v-if="data.editable"
            type="button"
            size="sm"
            variant="outline"
            @click="data.onEdit(data.id)"
        >
            <Pencil data-icon="inline-start" aria-hidden="true" />
            Editar
        </Button>
    </NodeToolbar>

    <Handle
        type="target"
        :position="Position.Top"
        :connectable="data.editable"
        aria-label="Recibir relación académica"
    />
    <article
        class="w-64 overflow-hidden rounded-md border-2 bg-card text-card-foreground shadow-surface"
        :aria-label="`${data.code}: ${data.name}`"
    >
        <div class="flex min-h-20">
            <div
                class="flex w-9 shrink-0 items-center justify-center border-r bg-muted px-1 py-2"
            >
                <span
                    class="-rotate-90 text-[0.65rem] font-semibold whitespace-nowrap"
                >
                    {{ data.code }}
                </span>
            </div>
            <div
                class="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center"
            >
                <Badge v-if="data.organization_unit" variant="secondary">
                    {{ data.organization_unit }}
                </Badge>
                <h3 class="text-xs leading-snug font-semibold uppercase">
                    {{ data.name }}
                </h3>
            </div>
        </div>

        <dl
            v-if="data.display_fields.length > 0"
            class="grid border-t bg-muted/40"
            :style="{
                gridTemplateColumns: `repeat(${data.display_fields.length}, minmax(0, 1fr))`,
            }"
        >
            <div
                v-for="field in data.display_fields"
                :key="field.id"
                class="border-r text-center last:border-r-0"
            >
                <dt
                    class="bg-primary px-1 py-1 text-[0.6rem] font-semibold text-primary-foreground"
                >
                    {{ field.label }}
                </dt>
                <dd class="px-1 py-1 text-xs font-medium">
                    {{ field.value ?? '—' }}
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
