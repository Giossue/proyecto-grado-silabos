<script setup lang="ts">
import { computed, ref } from 'vue';
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
const searching = ref(false);
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
    searching.value ? query.value : (selectedOption.value?.label ?? ''),
);

const startSearch = (): void => {
    if (open.value) {
        return;
    }

    query.value = '';
    searching.value = true;
    open.value = true;
};
const selectOption = (option: Option): void => {
    selectedId.value = option.id;
    query.value = '';
    searching.value = false;
    open.value = false;
};
</script>

<template>
    <input type="hidden" :name="name" :value="selectedId" />

    <Popover v-model:open="open">
        <PopoverAnchor as-child>
            <Input
                :id="id"
                :model-value="inputValue"
                :placeholder="searching ? searchPlaceholder : placeholder"
                :aria-invalid="invalid"
                :aria-expanded="open"
                aria-autocomplete="list"
                @click="startSearch"
                @update:model-value="
                    (value) => {
                        query = String(value);
                        open = true;
                    }
                "
            />
        </PopoverAnchor>
        <PopoverContent
            class="w-(--reka-popover-trigger-width) max-h-72 overflow-y-auto p-1"
            align="start"
            @mousedown.stop
            @keydown.stop
        >
            <div v-if="filteredOptions.length > 0" class="flex flex-col">
                <button
                    v-for="option in filteredOptions"
                    :key="option.id"
                    type="button"
                    role="option"
                    :aria-selected="option.id === selectedId"
                    class="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-2 text-left text-sm outline-hidden select-none"
                    @mousedown.prevent
                    @click="selectOption(option)"
                >
                    {{ option.label }}
                </button>
            </div>
            <Empty v-else class="min-h-0 border-0 p-3">
                <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
            </Empty>
        </PopoverContent>
    </Popover>
</template>
