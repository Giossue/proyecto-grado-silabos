<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { ContextMenuSeparatorProps } from 'reka-ui';
import { ContextMenuSeparator, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<
    ContextMenuSeparatorProps & { class?: HTMLAttributes['class'] }
>();
const delegatedProps = reactiveOmit(props, 'class');
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
    <ContextMenuSeparator
        data-slot="context-menu-separator"
        v-bind="forwarded"
        :class="cn('bg-border -mx-1 my-1 h-px', props.class)"
    />
</template>
