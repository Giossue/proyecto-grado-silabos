<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/components/ui/popover';

type Option = {
    id: string;
    label: string;
};

const props = withDefaults(
    defineProps<{
        id: string;
        name: string;
        options: Option[];
        placeholder: string;
        searchPlaceholder?: string;
        emptyLabel?: string;
        invalid?: boolean;
    }>(),
    {
        searchPlaceholder: 'Buscar…',
        emptyLabel: 'No hay resultados.',
        invalid: false,
    },
);

const open = ref(false);
const query = ref('');
const selectedId = ref('');
const selectedOption = computed(() =>
    props.options.find((option) => option.id === selectedId.value),
);
const filteredOptions = computed(() => {
    const normalizedQuery = query.value.trim().toLocaleLowerCase('es');

    if (normalizedQuery === '') {
        return props.options;
    }

    return props.options.filter((option) =>
        option.label.toLocaleLowerCase('es').includes(normalizedQuery),
    );
});
const inputValue = computed(() =>
    open.value ? query.value : (selectedOption.value?.label ?? ''),
);

const openSearch = (): void => {
    query.value = '';
    open.value = true;
};
const selectOption = (option: Option): void => {
    selectedId.value = option.id;
    query.value = '';
    open.value = false;
};
</script>

<template>
    <input type="hidden" :name="name" :value="selectedId" />

    <Popover v-model:open="open">
        <PopoverAnchor as-child>
            <div class="relative">
                <Input
                    :id="id"
                    :model-value="inputValue"
                    :placeholder="open ? searchPlaceholder : placeholder"
                    :aria-invalid="invalid"
                    aria-autocomplete="list"
                    @focus="openSearch"
                    @update:model-value="
                        (value) => {
                            query = String(value);
                            open = true;
                        }
                    "
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="absolute inset-y-0 right-0 my-auto"
                    :aria-label="open ? 'Ocultar opciones' : 'Mostrar opciones'"
                    :aria-expanded="open"
                    @click="open ? (open = false) : openSearch()"
                >
                    <ChevronDown aria-hidden="true" />
                </Button>
            </div>
        </PopoverAnchor>
        <PopoverContent
            class="w-(--reka-popover-trigger-width) max-h-72 overflow-y-auto p-1"
            align="start"
            @mousedown.stop
            @keydown.stop
        >
            <div v-if="filteredOptions.length > 0" class="flex flex-col gap-1">
                <Button
                    v-for="option in filteredOptions"
                    :key="option.id"
                    type="button"
                    variant="ghost"
                    class="w-full justify-start text-left whitespace-normal"
                    @click="selectOption(option)"
                >
                    {{ option.label }}
                </Button>
            </div>
            <Empty v-else class="min-h-0 border-0 p-3">
                <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
            </Empty>
        </PopoverContent>
    </Popover>
</template>
