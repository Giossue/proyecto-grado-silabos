<script setup lang="ts">
import { Form, useForm } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';
import type { AcademicStructureProps, Option } from '@/types/academic';

type OfferingEntity = 'oferta' | 'paralelo';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: OfferingEntity;
    }
>();

const title = computed(() =>
    props.entity === 'oferta' ? 'Abrir ofertas' : 'Agregar paralelo',
);
const description = computed(() =>
    props.entity === 'oferta'
        ? 'Elija el periodo y el campus una sola vez y marque las materias que se dictan. La modalidad la fija la carrera, o cada materia si la carrera combina modalidades.'
        : 'Agregue un paralelo a una oferta académica existente.',
);

/*
 * Ofertas en lote (I-36): el formulario nativo no sirve para una lista marcada con
 * búsqueda y «todo el ciclo», así que se arma con `useForm` y se envía como JSON.
 */
const batch = useForm<{
    period_id: string;
    campus_id: string;
    subject_ids: string[];
}>({ period_id: '', campus_id: '', subject_ids: [] });
const search = ref('');

const cycles = computed(() => {
    const groups = new Map<number, Option[]>();

    for (const subject of props.options.activeSubjects) {
        const cycle = subject.ciclo ?? 0;
        groups.set(cycle, [...(groups.get(cycle) ?? []), subject]);
    }

    return Array.from(groups.entries())
        .sort(([left], [right]) => left - right)
        .map(([cycle, subjects]) => ({ cycle, subjects }));
});
const matches = (subject: Option): boolean => {
    const needle = search.value.trim().toLocaleLowerCase('es');

    return (
        needle === '' ||
        `${subject.codigo_institucional ?? ''} ${subject.nombre ?? ''}`
            .toLocaleLowerCase('es')
            .includes(needle)
    );
};
const visibleCycles = computed(() =>
    cycles.value
        .map(({ cycle, subjects }) => ({
            cycle,
            subjects: subjects.filter(matches),
        }))
        .filter(({ subjects }) => subjects.length > 0),
);
const selected = computed(() => new Set(batch.subject_ids));
const isSelected = (id: string): boolean => selected.value.has(id);
const toggle = (id: string, checked: boolean): void => {
    batch.subject_ids = checked
        ? Array.from(new Set([...batch.subject_ids, id]))
        : batch.subject_ids.filter((item) => item !== id);
};
const cycleState = (subjects: Option[]): boolean | 'indeterminate' => {
    const count = subjects.filter((subject) => isSelected(subject.id)).length;

    return count === 0
        ? false
        : count === subjects.length
          ? true
          : 'indeterminate';
};
const toggleCycle = (subjects: Option[], checked: boolean): void => {
    const ids = subjects.map((subject) => subject.id);
    batch.subject_ids = checked
        ? Array.from(new Set([...batch.subject_ids, ...ids]))
        : batch.subject_ids.filter((id) => !ids.includes(id));
};
const submitLabel = computed(() =>
    batch.subject_ids.length === 0
        ? 'Abrir ofertas'
        : `Abrir ${batch.subject_ids.length} ${batch.subject_ids.length === 1 ? 'oferta' : 'ofertas'}`,
);
const submitBatch = (close: () => void): void => {
    batch.post(CareerAcademicStructureController.storeOfferingBatch.url(), {
        preserveScroll: true,
        onSuccess: () => {
            batch.reset();
            search.value = '';
            close();
        },
    });
};
const subjectError = computed(
    () =>
        batch.errors.subject_ids ??
        Object.entries(batch.errors).find(([key]) =>
            key.startsWith('subject_ids.'),
        )?.[1],
);

watch(
    () => props.entity,
    () => batch.reset(),
);
</script>

<template>
    <FormSheet
        :trigger-label="props.entity === 'oferta' ? 'Abrir ofertas' : 'Agregar'"
        :title="title"
        :description="description"
    >
        <template #default="{ close }">
            <form
                v-if="props.entity === 'oferta'"
                class="contents"
                @submit.prevent="submitBatch(close)"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(batch.errors.period_id)">
                        <FieldLabel for="offering-period" required>
                            Periodo académico
                        </FieldLabel>
                        <Select v-model="batch.period_id" required>
                            <SelectTrigger
                                id="offering-period"
                                :aria-invalid="Boolean(batch.errors.period_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione un periodo"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.periods"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[batch.errors.period_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(batch.errors.campus_id)">
                        <FieldLabel for="offering-campus" required>
                            Campus
                        </FieldLabel>
                        <Select v-model="batch.campus_id" required>
                            <SelectTrigger
                                id="offering-campus"
                                :aria-invalid="Boolean(batch.errors.campus_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione un campus"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.campuses"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[batch.errors.campus_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(subjectError)">
                        <FieldLabel for="offering-subject-search" required>
                            Materias de la malla activa
                        </FieldLabel>
                        <Input
                            id="offering-subject-search"
                            v-model="search"
                            type="search"
                            placeholder="Buscar por código o nombre"
                        />
                        <FieldDescription>
                            Marque un ciclo completo o materias sueltas. Las que
                            ya tengan oferta en ese periodo y campus se omiten.
                        </FieldDescription>
                        <div
                            v-if="options.activeSubjects.length === 0"
                            class="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
                        >
                            La malla activa no tiene materias.
                        </div>
                        <div
                            v-else
                            class="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-md border p-3"
                        >
                            <p
                                v-if="visibleCycles.length === 0"
                                class="text-sm text-muted-foreground"
                            >
                                Ninguna materia coincide con la búsqueda.
                            </p>
                            <div
                                v-for="group in visibleCycles"
                                :key="group.cycle"
                                class="flex flex-col gap-1"
                            >
                                <div class="flex items-center gap-2">
                                    <Checkbox
                                        :id="`offering-cycle-${group.cycle}`"
                                        :model-value="
                                            cycleState(group.subjects)
                                        "
                                        @update:model-value="
                                            toggleCycle(
                                                group.subjects,
                                                $event === true,
                                            )
                                        "
                                    />
                                    <Label
                                        :for="`offering-cycle-${group.cycle}`"
                                        class="text-sm font-medium"
                                    >
                                        {{
                                            group.cycle === 0
                                                ? 'Sin ciclo'
                                                : `Ciclo ${group.cycle}`
                                        }}
                                        <span
                                            class="font-normal text-muted-foreground"
                                        >
                                            · {{ group.subjects.length }}
                                        </span>
                                    </Label>
                                </div>
                                <div
                                    v-for="subject in group.subjects"
                                    :key="subject.id"
                                    class="flex items-center gap-2 pl-6"
                                >
                                    <Checkbox
                                        :id="`offering-subject-${subject.id}`"
                                        :model-value="isSelected(subject.id)"
                                        @update:model-value="
                                            toggle(subject.id, $event === true)
                                        "
                                    />
                                    <Label
                                        :for="`offering-subject-${subject.id}`"
                                        class="text-sm font-normal"
                                    >
                                        <span class="text-muted-foreground">
                                            {{ subject.codigo_institucional }}
                                        </span>
                                        {{ subject.nombre }}
                                    </Label>
                                </div>
                            </div>
                        </div>
                        <FieldError :errors="[subjectError]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="batch.processing"
                        :icon="Plus"
                        :label="submitLabel"
                    />
                </FieldGroup>
            </form>
            <Form
                v-else
                v-bind="
                    CareerAcademicStructureController.store.form(props.entity)
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.offering_id)">
                        <FieldLabel for="parallel-offering" required>
                            Oferta académica
                        </FieldLabel>
                        <Select name="offering_id" required>
                            <SelectTrigger
                                id="parallel-offering"
                                :aria-invalid="Boolean(errors.offering_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una oferta"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.offerings"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.offering_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.code)">
                        <FieldLabel for="parallel-code" required>
                            Código de paralelo
                        </FieldLabel>
                        <Input
                            id="parallel-code"
                            name="code"
                            placeholder="Ej. A"
                            required
                            :aria-invalid="Boolean(errors.code)"
                        />
                        <FieldError :errors="[errors.code]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.shift)">
                        <FieldLabel for="parallel-shift">Jornada</FieldLabel>
                        <Select name="shift">
                            <SelectTrigger
                                id="parallel-shift"
                                :aria-invalid="Boolean(errors.shift)"
                            >
                                <SelectValue
                                    placeholder="Seleccione la jornada"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="shift in SHIFTS"
                                        :key="shift.value"
                                        :value="shift.value"
                                    >
                                        {{ shift.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.shift]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        :label="submitLabel"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
