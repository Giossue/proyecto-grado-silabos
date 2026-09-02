<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/components/ui/popover';

const props = defineProps<{
    id: string;
    name: string;
    modelValue: string;
    options: string[];
    invalid?: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: string];
}>();

const open = ref(false);
const suggestions = computed(() => {
    const query = props.modelValue.trim().toLocaleLowerCase('es');

    return props.options.filter((option) =>
        option.toLocaleLowerCase('es').includes(query),
    );
});

watch(
    () => props.options,
    () => {
        if (props.options.length === 0) {
            open.value = false;
        }
    },
);

const updateValue = (value: string | number): void => {
    emit('update:modelValue', String(value));
    open.value = props.options.length > 0;
};

const selectOption = (option: string): void => {
    emit('update:modelValue', option);
    open.value = false;
};
</script>

<template>
    <Popover v-model:open="open">
        <PopoverAnchor as-child>
            <div class="relative">
                <Input
                    :id="id"
                    :name="name"
                    :model-value="modelValue"
                    placeholder="Ej. Unidad profesional"
                    required
                    class="pr-10"
                    :aria-invalid="invalid"
                    aria-autocomplete="list"
                    @focus="open = options.length > 0"
                    @update:model-value="updateValue"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="absolute inset-y-0 right-0 h-full w-9"
                    :aria-label="open ? 'Ocultar unidades sugeridas' : 'Mostrar unidades sugeridas'"
                    :aria-expanded="open"
                    @click="open = !open"
                >
                    <ChevronDown aria-hidden="true" />
                </Button>
            </div>
        </PopoverAnchor>
        <PopoverContent
            v-if="suggestions.length > 0"
            class="w-(--reka-popover-trigger-width) p-1"
            align="start"
            @mousedown.stop
            @keydown.stop
        >
            <ul aria-label="Unidades de organización curricular usadas">
                <li v-for="option in suggestions" :key="option">
                    <Button
                        type="button"
                        variant="ghost"
                        class="w-full justify-start"
                        @click="selectOption(option)"
                    >
                        {{ option }}
                    </Button>
                </li>
            </ul>
        </PopoverContent>
    </Popover>
</template>
