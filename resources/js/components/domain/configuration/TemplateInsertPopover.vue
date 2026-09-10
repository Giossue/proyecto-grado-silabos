<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { ref } from 'vue';
import TemplateBlockCreator from '@/components/domain/configuration/TemplateBlockCreator.vue';
import TemplateFieldCreator from '@/components/domain/configuration/TemplateFieldCreator.vue';
import TemplateIconPopover from '@/components/domain/configuration/TemplateIconPopover.vue';
import { PopoverContent } from '@/components/ui/popover';
import type { TemplateContentType } from '@/types/configuration';

type EditableContentType = Exclude<
    TemplateContentType,
    'institutional' | 'flow'
>;

defineProps<{
    templateId: string;
    sectionId: string;
    fieldPosition: number;
    blockPosition: number;
    blockTypes: { value: EditableContentType; label: string }[];
}>();

const open = ref(false);
</script>

<template>
    <TemplateIconPopover
        :open="open"
        label="Agregar contenido"
        variant="default"
        size="icon-sm"
        button-class="size-7 rounded-full p-0 text-primary-foreground opacity-100 shadow-md ring-2 ring-background transition-transform hover:scale-110 focus-visible:scale-110"
        tooltip-side="bottom"
        @update:open="open = $event"
    >
        <template #icon>
            <Plus aria-hidden="true" />
        </template>

        <PopoverContent align="center" class="w-48 p-1.5">
            <div class="flex flex-col gap-1">
                <TemplateFieldCreator
                    :template-id="templateId"
                    :section-id="sectionId"
                    :position="fieldPosition"
                    :block-types="blockTypes"
                    choice
                    @closed="open = false"
                />
                <TemplateBlockCreator
                    :template-id="templateId"
                    :position="blockPosition"
                    :block-types="blockTypes"
                    choice
                    @closed="open = false"
                />
            </div>
        </PopoverContent>
    </TemplateIconPopover>
</template>
