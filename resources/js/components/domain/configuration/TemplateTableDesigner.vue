<script setup lang="ts">
import { Check, MoreHorizontal, Plus, Trash2, X } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
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
    TableColumnType,
    TableLayout,
} from '@/lib/tableLayout';

/**
 * Diseñador de tabla sobre la hoja (I-34). Se edita como en Word pero sin dejar
 * que se rompa: renombrar con un clic, columna nueva con «+», arrastrar para
 * reordenar, seleccionar vecinas para agrupar. Emite el esquema; el editor de la
 * plantilla lo guarda.
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
const selecting = ref(false);
const selected = ref<string[]>([]);
const groupName = ref('');
const editing = ref<Editing | null>(null);
const editValue = ref('');
const editorInput = ref<HTMLInputElement | null>(null);
const draggedColumn = ref<string | null>(null);
const dropTarget = ref<string | null>(null);
/**
 * Claves creadas en esta sesión con el nombre provisional («Nueva columna»). Al
 * ponerles nombre real la clave se rehace a partir de él; después ya no cambia,
 * porque las celdas guardadas cuelgan de ella.
 */
const freshKeys = new Set<string>();

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

const setEditorRef = (element: unknown): void => {
    const instance = element as { $el?: HTMLInputElement } | null;
    editorInput.value = instance?.$el ?? null;
};

const commit = (): void => {
    emit('update:layout', cloneTableLayout(draft.value));
};

const isEditing = (kind: Editing['kind'], key: string): boolean =>
    editing.value?.kind === kind && editing.value.key === key;

const startRename = async (
    kind: Editing['kind'],
    key: string,
    value: string,
): Promise<void> => {
    if (props.readonly || selecting.value) {
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
};

const commitRename = (): void => {
    const current = editing.value;
    editing.value = null;
    const value = editValue.value.trim();

    if (current === null || value === '') {
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

const addColumn = (): void => {
    const label = 'Nueva columna';
    const key = tableKeyFor(
        label,
        draft.value.columns.map((column) => column.key),
    );
    draft.value.columns.push({
        key,
        label,
        type: 'text',
        group: null,
        band: null,
    });
    freshKeys.add(key);
    commit();
    void startRename('leaf', key, label);
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
    const column = draft.value.columns.find((item) => item.key === key);

    if (!column || column.type === type) {
        return;
    }

    column.type = type;
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

const startSelecting = (): void => {
    selecting.value = true;
    selected.value = [];
    groupName.value = '';
    editing.value = null;
};

const stopSelecting = (): void => {
    selecting.value = false;
    selected.value = [];
    groupName.value = '';
};

const toggleSelected = (key: string): void => {
    selected.value = selected.value.includes(key)
        ? selected.value.filter((item) => item !== key)
        : [...selected.value, key];
};

const selectedIndexes = computed(() =>
    selected.value
        .map((key) =>
            draft.value.columns.findIndex((column) => column.key === key),
        )
        .filter((index) => index >= 0)
        .sort((a, b) => a - b),
);

const selectionIsContiguous = computed(() =>
    selectedIndexes.value.every(
        (index, position) =>
            position === 0 || index === selectedIndexes.value[position - 1] + 1,
    ),
);

/**
 * Columnas sueltas vecinas → grupo. Si alguna ya tiene grupo, la selección debe
 * cubrir esos grupos enteros y pasa a ser un agrupamiento (nivel superior).
 */
const createGroup = (): void => {
    const name = groupName.value.trim();

    if (name === '' || selectedIndexes.value.length < 2) {
        toast.error('Elija dos o más columnas vecinas y escriba un nombre.');

        return;
    }

    if (!selectionIsContiguous.value) {
        toast.error('Las columnas agrupadas deben estar juntas.');

        return;
    }

    const columns = selectedIndexes.value.map(
        (index) => draft.value.columns[index],
    );
    const ungrouped = columns.every((column) => column.group === null);

    if (ungrouped) {
        const bands = new Set(columns.map((column) => column.band));

        if (bands.size > 1) {
            toast.error('Un grupo no puede cruzar dos agrupamientos.');

            return;
        }

        const key = tableKeyFor(
            name,
            draft.value.groups.map((group) => group.key),
        );
        draft.value.groups.push({ key, label: name });

        for (const column of columns) {
            column.group = key;
        }
    } else {
        if (columns.some((column) => column.band !== null)) {
            toast.error('Estas columnas ya tienen un agrupamiento.');

            return;
        }

        const insideGroups = new Set(
            columns
                .map((column) => column.group)
                .filter((group) => group !== null),
        );
        const covered = draft.value.columns
            .filter(
                (column) =>
                    column.group !== null && insideGroups.has(column.group),
            )
            .every((column) => selected.value.includes(column.key));

        if (!covered) {
            toast.error('Incluya los grupos completos para agruparlos.');

            return;
        }

        const key = tableKeyFor(
            name,
            draft.value.bands.map((band) => band.key),
        );
        draft.value.bands.push({ key, label: name });

        for (const column of columns) {
            column.band = key;
        }
    }

    stopSelecting();
    commit();
};

const ungroup = (cell: HeaderCell): void => {
    for (const column of draft.value.columns) {
        if (cell.kind === 'group' && column.group === cell.key) {
            column.group = null;
        }

        if (cell.kind === 'band' && column.band === cell.key) {
            column.band = null;
        }
    }

    pruneContainers();
    commit();
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

const addHeaderField = (): void => {
    const label = 'Nuevo dato';
    const key = tableKeyFor(
        label,
        draft.value.header_fields.map((field) => field.key),
    );
    draft.value.header_fields.push({ key, label });
    freshKeys.add(key);
    commit();
    void startRename('header', key, label);
};

const removeHeaderField = (key: string): void => {
    draft.value.header_fields = draft.value.header_fields.filter(
        (field) => field.key !== key,
    );
    commit();
};

const toggleTotals = (): void => {
    draft.value.totals.enabled = !draft.value.totals.enabled;
    commit();
};

const toggleRepeat = (): void => {
    draft.value.repeat.enabled = !draft.value.repeat.enabled;
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
        <div v-if="!readonly" class="dt-tools">
            <template v-if="selecting">
                <span class="dt-hint"
                    >Pulse las columnas vecinas a agrupar</span
                >
                <Input
                    v-model="groupName"
                    class="h-8 max-w-56"
                    aria-label="Nombre del grupo"
                    placeholder="Ej. Horas por semana"
                    @keydown.enter.prevent="createGroup"
                    @keydown.esc.prevent="stopSelecting"
                />
                <Button type="button" size="sm" @click="createGroup">
                    <Check data-icon="inline-start" aria-hidden="true" />
                    Crear grupo
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    @click="stopSelecting"
                >
                    Cancelar
                </Button>
            </template>
            <template v-else>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    @click="addColumn"
                >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Columna
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    :disabled="columnCount < 2"
                    @click="startSelecting"
                >
                    Agrupar
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    @click="addHeaderField"
                >
                    <Plus data-icon="inline-start" aria-hidden="true" />
                    Dato de cabecera
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    :aria-pressed="draft.totals.enabled"
                    @click="toggleTotals"
                >
                    <Check
                        data-icon="inline-start"
                        aria-hidden="true"
                        :class="{ invisible: !draft.totals.enabled }"
                    />
                    Totales
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    :aria-pressed="draft.repeat.enabled"
                    @click="toggleRepeat"
                >
                    <Check
                        data-icon="inline-start"
                        aria-hidden="true"
                        :class="{ invisible: !draft.repeat.enabled }"
                    />
                    Por unidad
                </Button>
            </template>
        </div>

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
                        <template v-else>{{ draft.repeat.label }} No.</template>
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
                        :class="{
                            'dt-head-selected': selected.includes(cell.key),
                            'dt-head-selectable':
                                selecting && cell.kind === 'leaf',
                            'dt-head-drop': dropTarget === cell.key,
                        }"
                        :draggable="
                            !readonly && !selecting && cell.kind === 'leaf'
                        "
                        @dragstart="
                            cell.kind === 'leaf' && startDrag($event, cell.key)
                        "
                        @dragover="
                            cell.kind === 'leaf' && overColumn($event, cell.key)
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
                                v-else-if="selecting && cell.kind === 'leaf'"
                                type="button"
                                class="dt-rename"
                                :aria-pressed="selected.includes(cell.key)"
                                @click="toggleSelected(cell.key)"
                            >
                                {{ cell.label }}
                            </button>
                            <button
                                v-else-if="!readonly"
                                type="button"
                                class="dt-rename"
                                :aria-label="`Renombrar ${cell.label}`"
                                @click="
                                    startRename(cell.kind, cell.key, cell.label)
                                "
                            >
                                {{ cell.label }}
                            </button>
                            <template v-else>{{ cell.label }}</template>

                            <DropdownMenu v-if="!readonly && !selecting">
                                <DropdownMenuTrigger as-child>
                                    <button
                                        type="button"
                                        class="dt-icon"
                                        :aria-label="`Acciones de ${cell.label}`"
                                    >
                                        <MoreHorizontal aria-hidden="true" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <template v-if="cell.kind === 'leaf'">
                                        <DropdownMenuLabel
                                            >Tipo</DropdownMenuLabel
                                        >
                                        <DropdownMenuItem
                                            @select="setType(cell.key, 'text')"
                                        >
                                            <Check
                                                aria-hidden="true"
                                                :class="{
                                                    invisible:
                                                        draft.columns[
                                                            cell.columns[0]
                                                        ]?.type !== 'text',
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
                                                        draft.columns[
                                                            cell.columns[0]
                                                        ]?.type !== 'number',
                                                }"
                                            />
                                            Número
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            @select="
                                                startRename(
                                                    'leaf',
                                                    cell.key,
                                                    cell.label,
                                                )
                                            "
                                        >
                                            Renombrar
                                        </DropdownMenuItem>
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
                                            @select="ungroup(cell)"
                                        >
                                            <Trash2 aria-hidden="true" />
                                            Desagrupar
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
                            columnIndex === 0 ? 'dt-totals-label' : 'dt-number'
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
                            <template v-else>{{ draft.totals.label }}</template>
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
    </div>
</template>

<style scoped>
/* Mismo dibujo que la hoja: colores fijos porque representan papel. */
.dt {
    margin-bottom: 6pt;
}

.dt-tools {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 4pt;
}

.dt-hint {
    color: #595959;
    font-size: 0.8rem;
    margin-inline-end: 0.25rem;
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

.dt-head-selectable {
    cursor: pointer;
}

.dt-head-selected {
    background: #1f497d;
    outline: 2px solid #ffd966;
    outline-offset: -2px;
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

.dt-head-selectable .dt-rename {
    cursor: pointer;
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
