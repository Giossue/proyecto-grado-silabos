<script setup lang="ts">
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3';
import { computed } from 'vue';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const props = defineProps(nodeViewProps);

const kind = computed(() => props.node.type.name);
const label = computed(() => {
    if (kind.value === 'variable') {
        return `@${props.node.attrs.id}`;
    }

    if (kind.value === 'column') {
        return `$${props.node.attrs.key}`;
    }

    return props.node.attrs.choice
        ? `X si ${props.node.attrs.label} = ${props.node.attrs.choice}`
        : String(props.node.attrs.label);
});
const tokenClass = computed(() =>
    kind.value === 'variable'
        ? 'template-table-variable'
        : 'template-table-field',
);
const dataAttributes = computed(() => ({
    [kind.value === 'variable'
        ? 'data-template-variable'
        : `data-template-${kind.value}`]:
        kind.value === 'variable' ? props.node.attrs.id : props.node.attrs.key,
}));
</script>

<template>
    <NodeViewWrapper
        as="span"
        :class="tokenClass"
        contenteditable="false"
        v-bind="dataAttributes"
    >
        <Tooltip>
            <TooltipTrigger as-child>
                <span class="inline-block max-w-full truncate">
                    {{ label }}
                </span>
            </TooltipTrigger>
            <TooltipContent>{{ label }}</TooltipContent>
        </Tooltip>
    </NodeViewWrapper>
</template>
