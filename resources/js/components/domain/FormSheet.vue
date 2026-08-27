<script setup lang="ts">
import { Plus } from '@lucide/vue';
import type { VNode } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';

withDefaults(
    defineProps<{
        triggerLabel: string;
        title: string;
        description: string;
        showTrigger?: boolean;
    }>(),
    {
        showTrigger: true,
    },
);

defineSlots<{
    trigger?(): VNode[];
    default(props: { close: () => void }): VNode[];
}>();

const open = defineModel<boolean>('open', { default: false });

const close = (): void => {
    open.value = false;
};
</script>

<template>
    <Sheet v-model:open="open">
        <SheetTrigger v-if="showTrigger" :as-child="true">
            <slot name="trigger">
                <!--
                    En móvil el disparador flota sobre el contenido, así que se reduce al
                    icono y se vuelve circular: una píldora con texto taparía media
                    pantalla. La etiqueta sigue disponible para lectores mediante
                    `aria-label`.
                -->
                <Button
                    class="w-full max-sm:size-14 max-sm:rounded-full max-sm:p-0 sm:w-auto"
                    :aria-label="triggerLabel"
                >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    <span class="max-sm:hidden">{{ triggerLabel }}</span>
                </Button>
            </slot>
        </SheetTrigger>
        <SheetContent side="right" class="w-full sm:max-w-lg">
            <SheetHeader>
                <SheetTitle>{{ title }}</SheetTitle>
                <SheetDescription>{{ description }}</SheetDescription>
            </SheetHeader>
            <div class="flex-1 overflow-y-auto px-4 pb-4">
                <slot :close="close" />
            </div>
        </SheetContent>
    </Sheet>
</template>
