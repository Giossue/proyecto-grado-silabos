<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card';

type PreviewBlock = {
    id: string;
    title: string;
    content_type: string;
    fields: { label: string; help: string | null }[];
};

defineProps<{
    sections: {
        id: string;
        title: string;
        description: string | null;
        blocks: PreviewBlock[];
    }[];
}>();

/** Texto de relleno: muestra cómo se verá el sílabo, no contenido real. */
const LOREM_PARAGRAPH =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

const LOREM_ITEMS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
];

const LOREM_TABLE = {
    headers: ['Lorem ipsum', 'Dolor sit', 'Amet consectetur'],
    rows: [
        ['Adipiscing elit', 'Sed do eiusmod', 'Tempor incididunt'],
        ['Ut labore', 'Et dolore magna', 'Aliqua ut enim'],
        ['Ad minim veniam', 'Quis nostrud', 'Exercitation ullamco'],
    ],
};

const fieldLabel = (block: PreviewBlock): string =>
    block.fields[0]?.label ?? block.title;
</script>

<template>
    <Card>
        <CardContent
            class="template-preview flex flex-col gap-8"
            aria-label="Vista previa del sílabo con datos de ejemplo"
        >
            <p
                v-if="sections.length === 0"
                class="text-sm text-muted-foreground"
            >
                Nada que previsualizar todavía.
            </p>
            <section
                v-for="(section, index) in sections"
                :key="section.id"
                class="flex flex-col gap-4"
            >
                <h2 class="border-b pb-1 text-lg font-semibold">
                    {{ index + 1 }}. {{ section.title }}
                </h2>
                <p
                    v-if="section.description"
                    class="text-sm text-muted-foreground"
                >
                    {{ section.description }}
                </p>
                <div
                    v-for="block in section.blocks"
                    :key="block.id"
                    class="flex flex-col gap-2"
                >
                    <h3 class="font-medium">{{ fieldLabel(block) }}</h3>

                    <table
                        v-if="block.content_type === 'table'"
                        class="w-full border-collapse text-sm"
                    >
                        <thead>
                            <tr>
                                <th
                                    v-for="header in LOREM_TABLE.headers"
                                    :key="header"
                                    class="border bg-muted px-3 py-1.5 text-start font-semibold"
                                >
                                    {{ header }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="(row, rowIndex) in LOREM_TABLE.rows"
                                :key="rowIndex"
                            >
                                <td
                                    v-for="cell in row"
                                    :key="cell"
                                    class="border px-3 py-1.5"
                                >
                                    {{ cell }}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <ul
                        v-else-if="block.content_type === 'bulleted_list'"
                        class="list-disc ps-6 text-sm"
                    >
                        <li v-for="item in LOREM_ITEMS" :key="item">
                            {{ item }}
                        </li>
                    </ul>

                    <ol
                        v-else-if="block.content_type === 'numbered_list'"
                        class="list-decimal ps-6 text-sm"
                    >
                        <li v-for="item in LOREM_ITEMS" :key="item">
                            {{ item }}
                        </li>
                    </ol>

                    <p v-else class="text-sm leading-relaxed">
                        {{ LOREM_PARAGRAPH }}
                    </p>
                </div>
                <p
                    v-if="section.blocks.length === 0"
                    class="text-sm text-muted-foreground"
                >
                    Este bloque no tiene campos.
                </p>
            </section>
        </CardContent>
    </Card>
</template>
