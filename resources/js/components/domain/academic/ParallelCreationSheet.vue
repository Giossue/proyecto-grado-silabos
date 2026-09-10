<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientPagination } from '@/composables/useClientPagination';
import { PARALLEL_SHIFTS as SHIFTS, shiftLabel } from '@/lib/parallelShifts';

const props = defineProps<{
    scheduledSubjectId: string;
    scheduledSubjectLabel: string;
    parallels: {
        id: string;
        code: string;
        shift: string | null;
        active: boolean;
    }[];
}>();

const open = defineModel<boolean>('open', { default: false });
const form = useForm<{ codes: string; shift: string }>({
    codes: '',
    shift: '',
});
const {
    items: parallelPage,
    meta: parallelMeta,
    setPage: setParallelPage,
} = useClientPagination(() => props.parallels);

const reset = (): void => {
    form.reset();
    form.clearErrors();
};

const submit = (close: () => void): void => {
    form.transform((data) => ({
        scheduled_subject_id: props.scheduledSubjectId,
        codes: [data.codes.trim()],
        shift: data.shift || null,
    })).post(CareerAcademicStructureController.storeParallels.url(), {
        preserveScroll: true,
        onSuccess: () => {
            reset();
            close();
        },
    });
};

watch(open, (isOpen) => {
    if (isOpen) {
        reset();
        setParallelPage(1);
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Agregar paralelo"
        title="Agregar paralelo"
        :description="`Añada un paralelo a la materia ${scheduledSubjectLabel} y defina su jornada.`"
        :show-trigger="false"
    >
        <template #default="{ close }">
            <form class="contents" @submit.prevent="submit(close)">
                <FieldGroup>
                    <Field :data-invalid="Boolean(form.errors.codes)">
                        <FieldLabel
                            :for="`parallel-creation-code-${scheduledSubjectId}`"
                            required
                        >
                            Código de paralelo
                        </FieldLabel>
                        <Input
                            :id="`parallel-creation-code-${scheduledSubjectId}`"
                            v-model="form.codes"
                            maxlength="30"
                            placeholder="Ej. B"
                            required
                            :aria-invalid="Boolean(form.errors.codes)"
                        />
                        <FieldError :errors="[form.errors.codes]" />
                    </Field>

                    <Field :data-invalid="Boolean(form.errors.shift)">
                        <FieldLabel
                            :for="`parallel-creation-shift-${scheduledSubjectId}`"
                        >
                            Jornada
                        </FieldLabel>
                        <Select v-model="form.shift">
                            <SelectTrigger
                                :id="`parallel-creation-shift-${scheduledSubjectId}`"
                                :aria-invalid="Boolean(form.errors.shift)"
                            >
                                <SelectValue
                                    placeholder="Sin jornada definida"
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
                        <FieldError :errors="[form.errors.shift]" />
                    </Field>

                    <section
                        class="space-y-2"
                        aria-labelledby="parallel-summary-title"
                    >
                        <h3
                            id="parallel-summary-title"
                            class="text-sm font-medium"
                        >
                            Paralelos registrados
                        </h3>
                        <div class="overflow-hidden rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Paralelo</TableHead>
                                        <TableHead>Jornada</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableEmpty
                                        v-if="parallels.length === 0"
                                        :colspan="2"
                                    >
                                        Sin paralelos registrados
                                    </TableEmpty>
                                    <TableRow
                                        v-for="parallel in parallelPage"
                                        v-else
                                        :key="parallel.id"
                                    >
                                        <TableCell>{{
                                            parallel.code
                                        }}</TableCell>
                                        <TableCell>
                                            {{ shiftLabel(parallel.shift) }}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                        <TablePagination
                            :meta="parallelMeta"
                            mode="client"
                            label="Paginación de paralelos registrados"
                            @update:page="setParallelPage"
                        />
                    </section>

                    <FormSheetActions
                        :close="close"
                        :processing="form.processing"
                        :icon="Plus"
                        label="Crear paralelo"
                    />
                </FieldGroup>
            </form>
        </template>
    </FormSheet>
</template>
