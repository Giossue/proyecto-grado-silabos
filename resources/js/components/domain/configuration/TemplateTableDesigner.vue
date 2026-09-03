<script setup lang="ts">
import { Check, MoreHorizontal, Trash2, X } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    cloneTableLayout,
    formatSum,
    headerRows,
    tableKeyFor,
} from '@/lib/tableLayout';
import type {
    HeaderCell,
    TableColumn,
    TableColumnType,
    TableLayout,
} from '@/lib/tableLayout';
import { isUnformattedTable, TABLE_PRESETS } from '@/lib/tablePresets';

/**
 * Diseñador de tabla sobre la hoja (I-34). Piensa como Word: cada celda de
 * cabecera tiene su menú (insertar, combinar con la derecha, separar, tipo,
 * quitar) y se renombra con un clic. Una tabla recién soltada ofrece los formatos
 * institucionales listos. Emite el esquema; el editor de la plantilla lo guarda.
 */
const props = defineProps<{
    layout: TableLayout;
    readonly: boolean;
}>();

const emit = defineEmits<{
    'update:layout': [layout: TableLayout];
}>();

type Editing = {
    kind: 'leaf' | 'group' | 'band' | 'header' | 'totals' | 'repeat';
    key: string;
};

const SAMPLE_TEXT = [
    'Lorem ipsum dolor sit amet',
    'Sed do eiusmod tempor',
    'Ut enim ad minim veniam',
];
const SAMPLE_NUMBERS = [2, 1, 3];

const draft = ref<TableLayout>(cloneTableLayout(props.layout));
const editing = ref<Editing | null>(null);
const editValue = ref('');
const editorInput = ref<HTMLInputElement | null>(null);
const draggedColumn = ref<string | null>(null);
const dropTarget = ref<string | null>(null);
/**
 * Claves creadas en esta sesión con un nombre provisional. Al ponerles nombre
 * real la clave se rehace a partir de él; después ya no cambia, porque las celdas
 * guardadas cuelgan de ella.
 */
const freshKeys = new Set<string>();
/**
 * Insertar o combinar dejan el nombre en edición y guardan al terminar de
 * escribirlo: un solo guardado, sin que la respuesta del primero pise al segundo.
 */
let pendingCommit = false;

watch(
    () => props.layout,
    (value) => {
        draft.value = cloneTableLayout(value);
    },
    { deep: true },
);

const header = computed(() => headerRows(draft.value));
const columnCount = computed(() => draft.value.columns.length);
const hasUnitHeader = computed(
    () => draft.value.repeat.enabled || draft.value.header_fields.length > 0,
);
const unformatted = computed(() => isUnformattedTable(draft.value));

const setEditorRef = (element: unknown): void => {
    const instance = element as { $el?: HTMLInputElement } | null;
    editorInput.value = instance?.$el ?? null;
};

const commit = (): void => {
    emit('update:layout', cloneTableLayout(draft.value));
};

const applyPreset = (key: string): void => {
    const preset = TABLE_PRESETS.find((item) => item.key === key);

    if (!preset) {
        return;
    }

    draft.value = cloneTableLayout(preset.layout);
    commit();
};

const isEditing = (kind: Editing['kind'], key: string): boolean =>
    editing.value?.kind === kind && editing.value.key === key;

const startRename = async (
    kind: Editing['kind'],
    key: string,
    value: string,
): Promise<void> => {
    if (props.readonly) {
        return;
    }

    editing.value = { kind, key };
    editValue.value = value;
    await nextTick();
    editorInput.value?.focus();
    editorInput.value?.select();
};

const cancelRename = (): void => {
    editing.value = null;

    if (pendingCommit) {
        pendingCommit = false;
        commit();
    }
};

const commitRename = (): void => {
    const current = editing.value;
    editing.value = null;
    const value = editValue.value.trim();

    const dirty = pendingCommit;
    pendingCommit = false;

    if (current === null || value === '') {
        if (dirty) {
            commit();
        }

        return;
    }

    const layout = draft.value;
    const target =
        current.kind === 'leaf'
            ? layout.columns.find((column) => column.key === current.key)
            : current.kind === 'group'
              ? layout.groups.find((group) => group.key === current.key)
              : current.kind === 'band'
                ? layout.bands.find((band) => band.key === current.key)
                : current.kind === 'header'
                  ? layout.header_fields.find(
                        (field) => field.key === current.key,
                    )
                  : current.kind === 'totals'
                    ? layout.totals
                    : layout.repeat;

    if (!target || target.label === value) {
        if (dirty) {
            commit();
        }

        return;
    }

    target.label = value;

    if (
        (current.kind === 'leaf' || current.kind === 'header') &&
        'key' in target &&
        freshKeys.has(target.key)
    ) {
        const siblings =
            current.kind === 'leaf'
                ? layout.columns.map((column) => column.key)
                : layout.header_fields.map((field) => field.key);
        const key = tableKeyFor(
            value,
            siblings.filter((sibling) => sibling !== target.key),
        );
        freshKeys.delete(target.key);
        target.key = key;
    }

    commit();
};

/** Grupos y agrupamientos sin columnas desaparecen. */
const pruneContainers = (): void => {
    const groups = new Set(draft.value.columns.map((column) => column.group));
    const bands = new Set(draft.value.columns.map((column) => column.band));
    draft.value.groups = draft.value.groups.filter((group) =>
        groups.has(group.key),
    );
    draft.value.bands = draft.value.bands.filter((band) => bands.has(band.key));
};

const columnAt = (key: string): TableColumn | undefined =>
    draft.value.columns.find((column) => column.key === key);

/** Nueva columna a la derecha, dentro del mismo grupo para no partir la cabecera. */
const insertRight = (key: string): void => {
    const index = draft.value.columns.findIndex((column) => column.key === key);
    const anchor = draft.value.columns[index];

    if (!anchor) {
        return;
    }

    const label = 'Nueva columna';
    const newKey = tableKeyFor(
        label,
        draft.value.columns.map((column) => column.key),
    );
    draft.value.columns.splice(index + 1, 0, {
        key: newKey,
        label,
        type: 'text',
        group: anchor.group,
        band: anchor.band,
    });
    freshKeys.add(newKey);
    pendingCommit = true;
    void startRename('leaf', newKey, label);
};

const removeColumn = (key: string): void => {
    if (columnCount.value <= 1) {
        toast.error('La tabla necesita al menos una columna.');

        return;
    }

    draft.value.columns = draft.value.columns.filter(
        (column) => column.key !== key,
    );
    pruneContainers();
    commit();
};

const setType = (key: string, type: TableColumnType): void => {
    const column = columnAt(key);

    if (!column || column.type === type) {
        return;
    }

    column.type = type;
    commit();
};

const columnsOfGroup = (group: string): TableColumn[] =>
    draft.value.columns.filter((column) => column.group === group);

/**
 * «Combinar con la derecha», como en Word: dos columnas sueltas forman un grupo;
 * una suelta se suma al grupo vecino; dos grupos distintos se abrazan con un
 * agrupamiento superior. La celda combinada nace lista para escribirle el nombre.
 */
const mergeRight = (key: string): void => {
    const index = draft.value.columns.findIndex((column) => column.key === key);
    const left = draft.value.columns[index];
    const right = draft.value.columns[index + 1];

    if (!left || !right) {
        return;
    }

    if (left.group !== null && left.group === right.group) {
        toast.error('Estas columnas ya están combinadas.');

        return;
    }

    if (left.group === null && right.group === null) {
        if (
            left.band !== null &&
            right.band !== null &&
            left.band !== right.band
        ) {
            toast.error('Están en agrupamientos distintos; sepárelas primero.');

            return;
        }

        const groupKey = tableKeyFor(
            'grupo',
            draft.value.groups.map((group) => group.key),
        );
        draft.value.groups.push({ key: groupKey, label: 'Grupo' });
        const band = left.band ?? right.band;
        left.group = groupKey;
        right.group = groupKey;
        left.band = band;
        right.band = band;
        pendingCommit = true;
        void startRename('group', groupKey, 'Grupo');

        return;
    }

    if (left.group === null || right.group === null) {
        const host = left.group === null ? right : left;
        const guest = left.group === null ? left : right;
        guest.group = host.group;
        guest.band = host.band;
        commit();

        return;
    }

    // Dos grupos distintos: un agrupamiento los abraza.
    if (left.band !== null && right.band !== null && left.band !== right.band) {
        toast.error('Están en agrupamientos distintos; sepárelas primero.');

        return;
    }

    const existing = left.band ?? right.band;
    const bandKey =
        existing ??
        tableKeyFor(
            'agrupamiento',
            draft.value.bands.map((band) => band.key),
        );

    if (existing === null) {
        draft.value.bands.push({ key: bandKey, label: 'Agrupamiento' });
    }

    for (const column of [
        ...columnsOfGroup(left.group),
        ...columnsOfGroup(right.group),
    ]) {
        column.band = bandKey;
    }

    if (existing === null) {
        pendingCommit = true;
        void startRename('band', bandKey, 'Agrupamiento');

        return;
    }

    commit();
};

const canMergeRight = (cell: HeaderCell): boolean =>
    cell.kind === 'leaf' && cell.columns[0] < columnCount.value - 1;

/** «Separar»: la columna sale de su grupo; un grupo o agrupamiento se deshace. */
const split = (cell: HeaderCell): void => {
    if (cell.kind === 'leaf') {
        const column = columnAt(cell.key);

        if (!column) {
            return;
        }

        if (column.group !== null) {
            column.group = null;
        } else {
            column.band = null;
        }
    } else {
        for (const column of draft.value.columns) {
            if (cell.kind === 'group' && column.group === cell.key) {
                column.group = null;
            }

            if (cell.kind === 'band' && column.band === cell.key) {
                column.band = null;
            }
        }
    }

    pruneContainers();
    commit();
};

const canSplit = (cell: HeaderCell): boolean => {
    if (cell.kind !== 'leaf') {
        return true;
    }

    const column = columnAt(cell.key);

    return (
        column !== undefined && (column.group !== null || column.band !== null)
    );
};

const startDrag = (event: DragEvent, key: string): void => {
    draggedColumn.value = key;
    event.dataTransfer?.setData('text/plain', key);

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
    }
};

const overColumn = (event: DragEvent, key: string): void => {
    if (draggedColumn.value === null || draggedColumn.value === key) {
        return;
    }

    event.preventDefault();
    dropTarget.value = key;
};

const endDrag = (): void => {
    draggedColumn.value = null;
    dropTarget.value = null;
};

/** La columna movida hereda grupo y agrupamiento solo si queda entre dos iguales. */
const dropOnColumn = (targetKey: string): void => {
    const sourceKey = draggedColumn.value;
    endDrag();

    if (sourceKey === null || sourceKey === targetKey) {
        return;
    }

    const columns = draft.value.columns;
    const from = columns.findIndex((column) => column.key === sourceKey);
    const to = columns.findIndex((column) => column.key === targetKey);

    if (from < 0 || to < 0) {
        return;
    }

    const [moved] = columns.splice(from, 1);
    columns.splice(to, 0, moved);

    const index = columns.indexOf(moved);
    const left = columns[index - 1];
    const right = columns[index + 1];
    moved.group =
        left && right && left.group === right.group ? left.group : null;
    moved.band = left && right && left.band === right.band ? left.band : null;

    pruneContainers();
    commit();
};

const removeHeaderField = (key: string): void => {
    draft.value.header_fields = draft.value.header_fields.filter(
        (field) => field.key !== key,
    );
    commit();
};

const sample = (columnIndex: number, rowIndex: number): string => {
    const column = draft.value.columns[columnIndex];

    return column.type === 'number'
        ? String(
              SAMPLE_NUMBERS[(rowIndex + columnIndex) % SAMPLE_NUMBERS.length],
          )
        : SAMPLE_TEXT[(rowIndex + columnIndex) % SAMPLE_TEXT.length];
};

const sampleTotal = (columnIndex: number): string =>
    formatSum(
        SAMPLE_TEXT.reduce(
            (total, _, rowIndex) =>
                total + Number(sample(columnIndex, rowIndex)),
            0,
        ),
    );
</script>

<template>
    <div class="dt">
        <!-- Tabla recién soltada: se elige un formato institucional, no se arma a mano. -->
        <div v-if="unformatted && !readonly" class="dt-gallery">
            <p class="dt-gallery-title">Elija el formato de la tabla</p>
            <div class="dt-gallery-grid">
                <button
                    v-for="preset in TABLE_PRESETS"
                    :key="preset.key"
                    type="button"
                    class="dt-preset"
                    @click="applyPreset(preset.key)"
                >
                    <span class="dt-preset-name">{{ preset.name }}</span>
                    <span class="dt-preset-preview" aria-hidden="true">
                        <span
                            v-for="(cells, rowIndex) in headerRows(
                                preset.layout,
                            )"
                            :key="rowIndex"
                            class="dt-preset-row"
                        >
                            <span
                                v-for="cell in cells"
                                :key="cell.id"
                                class="dt-preset-cell"
                                :style="{ flex: cell.colspan }"
                            />
                        </span>
                    </span>
                    <span class="dt-preset-description">
                        {{ preset.description }}
                    </span>
                </button>
            </div>
        </div>

        <template v-else>
            <table class="dt-table">
                <tbody v-if="hasUnitHeader">
                    <tr v-if="draft.repeat.enabled">
                        <th scope="row" class="dt-unit-label">
                            <Input
                                v-if="isEditing('repeat', 'repeat')"
                                :ref="setEditorRef"
                                v-model="editValue"
                                class="dt-input"
                                aria-label="Nombre de la unidad"
                                placeholder="Ej. Unidad"
                                @keydown.enter.prevent="commitRename"
                                @keydown.esc.prevent="cancelRename"
                                @blur="commitRename"
                            />
                            <button
                                v-else-if="!readonly"
                                type="button"
                                class="dt-rename"
                                :aria-label="`Renombrar ${draft.repeat.label}`"
                                @click="
                                    startRename(
                                        'repeat',
                                        'repeat',
                                        draft.repeat.label,
                                    )
                                "
                            >
                                {{ draft.repeat.label }} No.
                            </button>
                            <template v-else
                                >{{ draft.repeat.label }} No.</template
                            >
                        </th>
                        <td :colspan="Math.max(1, columnCount - 1)">1</td>
                    </tr>
                    <tr v-for="field in draft.header_fields" :key="field.key">
                        <th scope="row" class="dt-unit-label">
                            <span class="dt-cell-row">
                                <Input
                                    v-if="isEditing('header', field.key)"
                                    :ref="setEditorRef"
                                    v-model="editValue"
                                    class="dt-input"
                                    aria-label="Nombre del dato de cabecera"
                                    placeholder="Ej. Nombre de la unidad"
                                    @keydown.enter.prevent="commitRename"
                                    @keydown.esc.prevent="cancelRename"
                                    @blur="commitRename"
                                />
                                <button
                                    v-else-if="!readonly"
                                    type="button"
                                    class="dt-rename"
                                    :aria-label="`Renombrar ${field.label}`"
                                    @click="
                                        startRename(
                                            'header',
                                            field.key,
                                            field.label,
                                        )
                                    "
                                >
                                    {{ field.label }}
                                </button>
                                <template v-else>{{ field.label }}</template>
                                <button
                                    v-if="!readonly"
                                    type="button"
                                    class="dt-icon"
                                    :aria-label="`Quitar ${field.label}`"
                                    @click="removeHeaderField(field.key)"
                                >
                                    <X aria-hidden="true" />
                                </button>
                            </span>
                        </th>
                        <td :colspan="Math.max(1, columnCount - 1)">
                            Lorem ipsum dolor sit amet
                        </td>
                    </tr>
                </tbody>
                <thead>
                    <tr v-for="(cells, rowIndex) in header" :key="rowIndex">
                        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
                        <th
                            v-for="cell in cells"
                            :key="cell.id"
                            scope="col"
                            :colspan="cell.colspan"
                            :rowspan="cell.rowspan"
                            class="dt-head"
                            :class="{ 'dt-head-drop': dropTarget === cell.key }"
                            :draggable="!readonly && cell.kind === 'leaf'"
                            @dragstart="
                                cell.kind === 'leaf' &&
                                startDrag($event, cell.key)
                            "
                            @dragover="
                                cell.kind === 'leaf' &&
                                overColumn($event, cell.key)
                            "
                            @dragleave="dropTarget = null"
                            @drop.prevent="
                                cell.kind === 'leaf' && dropOnColumn(cell.key)
                            "
                            @dragend="endDrag"
                        >
                            <span class="dt-cell-row">
                                <Input
                                    v-if="isEditing(cell.kind, cell.key)"
                                    :ref="setEditorRef"
                                    v-model="editValue"
                                    class="dt-input dt-input-head"
                                    aria-label="Nombre de la columna"
                                    placeholder="Ej. Contenidos"
                                    @keydown.enter.prevent="commitRename"
                                    @keydown.esc.prevent="cancelRename"
                                    @blur="commitRename"
                                />
                                <button
                                    v-else-if="!readonly"
                                    type="button"
                                    class="dt-rename"
                                    :aria-label="`Renombrar ${cell.label}`"
                                    @click="
                                        startRename(
                                            cell.kind,
                                            cell.key,
                                            cell.label,
                                        )
                                    "
                                >
                                    {{ cell.label }}
                                </button>
                                <template v-else>{{ cell.label }}</template>

                                <DropdownMenu v-if="!readonly">
                                    <DropdownMenuTrigger as-child>
                                        <button
                                            type="button"
                                            class="dt-icon"
                                            :aria-label="`Acciones de ${cell.label}`"
                                        >
                                            <MoreHorizontal
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <template v-if="cell.kind === 'leaf'">
                                            <DropdownMenuItem
                                                @select="insertRight(cell.key)"
                                            >
                                                Insertar columna a la derecha
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                :disabled="!canMergeRight(cell)"
                                                @select="mergeRight(cell.key)"
                                            >
                                                Combinar con la derecha
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                :disabled="!canSplit(cell)"
                                                @select="split(cell)"
                                            >
                                                Separar
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>
                                                Tipo
                                            </DropdownMenuLabel>
                                            <DropdownMenuItem
                                                @select="
                                                    setType(cell.key, 'text')
                                                "
                                            >
                                                <Check
                                                    aria-hidden="true"
                                                    :class="{
                                                        invisible:
                                                            columnAt(cell.key)
                                                                ?.type !==
                                                            'text',
                                                    }"
                                                />
                                                Texto
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                @select="
                                                    setType(cell.key, 'number')
                                                "
                                            >
                                                <Check
                                                    aria-hidden="true"
                                                    :class="{
                                                        invisible:
                                                            columnAt(cell.key)
                                                                ?.type !==
                                                            'number',
                                                    }"
                                                />
                                                Número
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                @select="removeColumn(cell.key)"
                                            >
                                                <Trash2 aria-hidden="true" />
                                                Quitar columna
                                            </DropdownMenuItem>
                                        </template>
                                        <template v-else>
                                            <DropdownMenuItem
                                                @select="
                                                    startRename(
                                                        cell.kind,
                                                        cell.key,
                                                        cell.label,
                                                    )
                                                "
                                            >
                                                Renombrar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                variant="destructive"
                                                @select="split(cell)"
                                            >
                                                <Trash2 aria-hidden="true" />
                                                Separar
                                            </DropdownMenuItem>
                                        </template>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="rowIndex in [0, 1, 2]" :key="rowIndex">
                        <td
                            v-for="(column, columnIndex) in draft.columns"
                            :key="column.key"
                            :class="{ 'dt-number': column.type === 'number' }"
                        >
                            {{ sample(columnIndex, rowIndex) }}
                        </td>
                    </tr>
                    <tr v-if="draft.totals.enabled" class="dt-totals">
                        <td
                            v-for="(column, columnIndex) in draft.columns"
                            :key="column.key"
                            :class="
                                columnIndex === 0
                                    ? 'dt-totals-label'
                                    : 'dt-number'
                            "
                        >
                            <template v-if="columnIndex === 0">
                                <Input
                                    v-if="isEditing('totals', 'totals')"
                                    :ref="setEditorRef"
                                    v-model="editValue"
                                    class="dt-input"
                                    aria-label="Etiqueta de totales"
                                    placeholder="Ej. Total, horas"
                                    @keydown.enter.prevent="commitRename"
                                    @keydown.esc.prevent="cancelRename"
                                    @blur="commitRename"
                                />
                                <button
                                    v-else-if="!readonly"
                                    type="button"
                                    class="dt-rename"
                                    :aria-label="`Renombrar ${draft.totals.label}`"
                                    @click="
                                        startRename(
                                            'totals',
                                            'totals',
                                            draft.totals.label,
                                        )
                                    "
                                >
                                    {{ draft.totals.label }}
                                </button>
                                <template v-else>
                                    {{ draft.totals.label }}
                                </template>
                            </template>
                            <template v-else-if="column.type === 'number'">
                                {{ sampleTotal(columnIndex) }}
                            </template>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p v-if="draft.repeat.enabled" class="dt-note">
                Se repite por cada {{ draft.repeat.label.toLowerCase() }}.
            </p>
        </template>
    </div>
</template>

<style scoped>
/* Mismo dibujo que la hoja: colores fijos porque representan papel. */
.dt {
    margin-bottom: 6pt;
}

.dt-gallery {
    border: 1px dashed #7f7f7f;
    border-radius: 0.375rem;
    padding: 0.75rem;
}

.dt-gallery-title {
    color: #595959;
    font-size: 9pt;
    margin: 0 0 0.5rem;
}

.dt-gallery-grid {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
}

.dt-preset {
    background: #fff;
    border: 1px solid #bfbfbf;
    border-radius: 0.375rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem;
    text-align: left;
}

.dt-preset:hover,
.dt-preset:focus-visible {
    border-color: #0070c0;
    outline: none;
}

.dt-preset-name {
    font-size: 9.5pt;
    font-weight: 700;
}

.dt-preset-preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.dt-preset-row {
    display: flex;
    gap: 2px;
}

.dt-preset-cell {
    background: #4f81bd;
    border-radius: 2px;
    height: 6px;
}

.dt-preset-description {
    color: #595959;
    font-size: 8pt;
    line-height: 1.3;
}

.dt-table {
    border-collapse: collapse;
    font-size: 9pt;
    width: 100%;
}

.dt-table th,
.dt-table td {
    border: 1px solid #7f7f7f;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
}

.dt-head {
    background: #4f81bd;
    color: #fff;
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
}

.dt-head[draggable='true'] {
    cursor: grab;
}

.dt-head-drop {
    box-shadow: inset 3px 0 0 #ffd966;
}

.dt-unit-label {
    background: #dbe5f1;
    color: #1f497d;
    font-weight: 700;
    width: 28%;
}

.dt-table tbody tr:nth-child(even) td {
    background: #dbe5f1;
}

.dt-number {
    text-align: center;
}

.dt-totals td {
    background: #dbe5f1 !important;
    color: #1f497d;
    font-weight: 700;
}

.dt-totals-label {
    text-align: right !important;
}

.dt-note {
    color: #595959;
    font-size: 9pt;
    font-style: italic;
    margin: 3pt 0 0;
}

.dt-cell-row {
    align-items: center;
    display: inline-flex;
    gap: 0.25rem;
    justify-content: center;
    max-width: 100%;
}

.dt-rename {
    background: none;
    border: 0;
    border-radius: 0.2rem;
    color: inherit;
    cursor: text;
    font: inherit;
    padding: 0 0.15rem;
    text-align: inherit;
}

.dt-rename:hover,
.dt-rename:focus-visible {
    background: rgb(255 255 255 / 0.2);
    outline: none;
}

.dt-icon {
    background: none;
    border: 0;
    border-radius: 0.2rem;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    opacity: 0.55;
    padding: 0.1rem;
}

.dt-icon:hover,
.dt-icon:focus-visible,
.dt-icon[data-state='open'] {
    opacity: 1;
    outline: none;
}

.dt-icon svg {
    height: 0.9rem;
    width: 0.9rem;
}

.dt-input {
    background: #fff;
    color: #000;
    font-size: 9pt;
    font-weight: 400;
    height: 1.6rem;
    max-width: 14rem;
    padding: 0 0.35rem;
}
</style>
