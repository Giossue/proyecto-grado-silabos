<script setup lang="ts">
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

/** Texto de relleno: muestra cómo se verá el sílabo impreso, no contenido real. */
const LOREM_PARAGRAPHS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

const LOREM_ITEMS = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
];

const LOREM_TABLE = {
    headers: ['Lorem ipsum', 'Dolor sit', 'Amet consectetur', 'Adipiscing'],
    rows: [
        ['Sed do eiusmod', 'Tempor incididunt', 'Ut labore et dolore', '12'],
        ['Magna aliqua', 'Ut enim ad minim', 'Veniam quis nostrud', '8'],
        ['Exercitation', 'Ullamco laboris', 'Nisi ut aliquip', '4'],
    ],
};

const fieldLabel = (block: PreviewBlock): string =>
    block.fields[0]?.label ?? block.title;
</script>

<template>
    <div
        class="overflow-x-auto rounded-xl bg-muted p-4 sm:p-8"
        aria-label="Vista previa del sílabo con datos de ejemplo"
    >
        <div class="doc-page mx-auto">
            <header class="doc-header">
                <img
                    src="/images/silabo/ueb.jpeg"
                    alt="Universidad Estatal de Bolívar"
                    class="doc-logo-ueb"
                />
                <img
                    src="/images/silabo/facultad.jpeg"
                    alt="Facultad"
                    class="doc-logo-facultad"
                />
            </header>

            <h1 class="doc-title">PROGRAMA DE ASIGNATURA (SÍLABO)</h1>

            <p v-if="sections.length === 0" class="doc-empty">
                Nada que previsualizar todavía.
            </p>

            <section
                v-for="(section, sectionIndex) in sections"
                :key="section.id"
                class="doc-section"
            >
                <h2 class="doc-h2">
                    {{ sectionIndex + 1 }}. {{ section.title }}
                </h2>

                <p v-if="section.blocks.length === 0" class="doc-empty">
                    Este bloque no tiene campos.
                </p>

                <div
                    v-for="(block, blockIndex) in section.blocks"
                    :key="block.id"
                    class="doc-field"
                >
                    <h3 class="doc-h3">
                        {{ sectionIndex + 1 }}.{{ blockIndex + 1 }}
                        {{ fieldLabel(block) }}
                    </h3>

                    <table
                        v-if="block.content_type === 'table'"
                        class="doc-table"
                    >
                        <thead>
                            <tr>
                                <th
                                    v-for="header in LOREM_TABLE.headers"
                                    :key="header"
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
                                <td v-for="cell in row" :key="cell">
                                    {{ cell }}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <ul
                        v-else-if="block.content_type === 'bulleted_list'"
                        class="doc-list doc-list-bullets"
                    >
                        <li v-for="item in LOREM_ITEMS" :key="item">
                            {{ item }}
                        </li>
                    </ul>

                    <ol
                        v-else-if="block.content_type === 'numbered_list'"
                        class="doc-list doc-list-numbers"
                    >
                        <li v-for="item in LOREM_ITEMS" :key="item">
                            {{ item }}
                        </li>
                    </ol>

                    <template v-else>
                        <p
                            v-for="paragraph in LOREM_PARAGRAPHS"
                            :key="paragraph"
                            class="doc-p"
                        >
                            {{ paragraph }}
                        </p>
                    </template>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/*
 * Estándar del sílabo impreso (basado en el formato de la carrera, ordenado):
 * hoja carta, márgenes 2.5 cm, Arial 11 pt, interlineado sencillo, 6 pt entre
 * párrafos, títulos numerados en negrita y tablas con cabecera azul institucional.
 * Los colores son fijos porque representan papel, no la interfaz.
 */
.doc-page {
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    box-sizing: border-box;
    color: #000;
    font-family: Arial, 'Liberation Sans', Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.15;
    min-height: 27.94cm;
    padding: 2.5cm;
    width: 21.59cm;
}

.doc-header {
    align-items: center;
    display: flex;
    gap: 1cm;
    justify-content: space-between;
    margin-bottom: 0.8cm;
}

.doc-logo-ueb {
    height: 1.2cm;
    width: auto;
}

.doc-logo-facultad {
    height: 1.5cm;
    width: auto;
}

.doc-title {
    color: #0070c0;
    font-size: 16pt;
    font-weight: 700;
    margin: 0 0 0.6cm;
    text-align: center;
}

.doc-section {
    margin-bottom: 0.5cm;
}

.doc-h2 {
    font-size: 12pt;
    font-weight: 700;
    margin: 12pt 0 6pt;
}

.doc-h3 {
    font-size: 11pt;
    font-weight: 700;
    margin: 8pt 0 4pt;
}

.doc-field {
    margin-bottom: 6pt;
}

.doc-p {
    margin: 0 0 6pt;
    text-align: left;
}

.doc-empty {
    color: #595959;
    font-style: italic;
    margin: 0 0 6pt;
}

.doc-list {
    margin: 0 0 6pt;
    padding-inline-start: 0.63cm;
}

.doc-list li {
    margin-bottom: 3pt;
    padding-inline-start: 0.1cm;
}

.doc-list-bullets {
    list-style: disc;
}

.doc-list-numbers {
    list-style: decimal;
}

.doc-table {
    border-collapse: collapse;
    font-size: 9pt;
    margin: 0 0 6pt;
    width: 100%;
}

.doc-table th,
.doc-table td {
    border: 1px solid #7f7f7f;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
}

.doc-table th {
    background: #4f81bd;
    color: #fff;
    font-weight: 700;
}

.doc-table tbody tr:nth-child(even) td {
    background: #dbe5f1;
}
</style>
