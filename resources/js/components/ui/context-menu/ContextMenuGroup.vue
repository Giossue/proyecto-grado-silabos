<script setup lang="ts">
import type { ContextMenuGroupProps } from 'reka-ui';
import { ContextMenuGroup, useForwardProps } from 'reka-ui';

const props = defineProps<ContextMenuGroupProps>();
const forwarded = useForwardProps(props);
</script>

<template>
    <ContextMenuGroup data-slot="context-menu-group" v-bind="forwarded">
        <slot />
    </ContextMenuGroup>
</template>
