<script setup lang="ts">
import { Form, Link } from '@inertiajs/vue3';
import { Eye, Lock, Pause, Pencil, Play } from '@lucide/vue';
import { ref } from 'vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import ConvocationEditSheet from '@/components/domain/syllabus/ConvocationEditSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type Transition = 'abrir' | 'pausar' | 'reanudar';

/*
 * Todo lo que se hace con una convocatoria vive en su menú de tres puntos, como en
 * Administración: ver seguimiento, editar, abrir, pausar y reanudar. Prorrogar y cerrar
 * son del calendario institucional y viven en Administración.
 * Cada acción explica su consecuencia antes de confirmarla.
 */
defineProps<{
    convocation: {
        id: string;
        name: string;
        state: string;
        process_state: string;
        period_id: string;
        grouping_mode: string;
        source_ids: string[];
    };
    periods: { id: string; nombre: string }[];
    sources: { id: string; label: string }[];
}>();

const editOpen = ref(false);
const pending = ref<Transition | null>(null);

const dialogs: Record<
    Transition,
    { title: string; description: string; label: string; destructive?: boolean }
> = {
    abrir: {
        title: 'Abrir la convocatoria',
        description:
            'Se fijan la plantilla del proceso y las fuentes, se valida que cada paralelo tenga docente vigente y se generan todos los expedientes en una sola transacción. Si algo falta, no se crea ninguno.',
        label: 'Abrir y generar expedientes',
    },
    pausar: {
        title: 'Pausar la convocatoria',
        description:
            'Los docentes de su carrera no podrán editar ni enviar hasta que la reanude; sus borradores se conservan. La malla y las fuentes quedan editables. El motivo queda en auditoría.',
        label: 'Pausar',
    },
    reanudar: {
        title: 'Reanudar la convocatoria',
        description:
            'Los docentes vuelven a trabajar y la malla y las fuentes de la carrera quedan protegidas de nuevo.',
        label: 'Reanudar',
    },
};

const transitionForm = (id: string, transition: Transition) =>
    transition === 'abrir'
        ? ConvocationController.open.form(id)
        : ConvocationController.transition.form({
              convocation: id,
              transition,
          });
</script>

<template>
    <TableActionsMenu :label="`Acciones para ${convocation.name}`">
        <DropdownMenuItem as-child>
            <Link :href="ConvocationController.show(convocation.id)">
                <Eye aria-hidden="true" />
                Ver seguimiento
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="
                convocation.state === 'preparacion' ||
                convocation.state === 'pausada'
            "
            @select="editOpen = true"
        >
            <Pencil aria-hidden="true" />
            Editar
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="convocation.state === 'preparacion'"
            @select="pending = 'abrir'"
        >
            <Play aria-hidden="true" />
            Abrir convocatoria
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="convocation.state === 'abierta'"
            @select="pending = 'pausar'"
        >
            <Pause aria-hidden="true" />
            Pausar
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="convocation.state === 'pausada'"
            @select="pending = 'reanudar'"
        >
            <Play aria-hidden="true" />
            Reanudar
        </DropdownMenuItem>
        <DropdownMenuItem v-if="convocation.state === 'cerrada'" disabled>
            <Lock aria-hidden="true" />
            Convocatoria cerrada
        </DropdownMenuItem>
    </TableActionsMenu>

    <ConvocationEditSheet
        v-model:open="editOpen"
        :convocation="convocation"
        :periods="periods"
        :sources="sources"
    />

    <Dialog
        :open="pending !== null"
        @update:open="
            (isOpen) => {
                if (!isOpen) pending = null;
            }
        "
    >
        <DialogContent v-if="pending">
            <DialogHeader>
                <DialogTitle>{{ dialogs[pending].title }}</DialogTitle>
                <DialogDescription>{{
                    dialogs[pending].description
                }}</DialogDescription>
            </DialogHeader>
            <Form
                v-bind="transitionForm(convocation.id, pending)"
                v-slot="{ errors, processing }"
                class="flex flex-col gap-4"
                @success="pending = null"
            >
                <Field
                    v-if="pending === 'pausar'"
                    :data-invalid="Boolean(errors.reason)"
                >
                    <FieldLabel
                        :for="`convocation-pause-reason-${convocation.id}`"
                        required
                        >Motivo</FieldLabel
                    >
                    <Textarea
                        :id="`convocation-pause-reason-${convocation.id}`"
                        name="reason"
                        rows="3"
                        :aria-invalid="Boolean(errors.reason)"
                        placeholder="Corrección de las horas de dos materias de la malla antes de continuar."
                        required
                    />
                    <FieldError :errors="[errors.reason]" />
                </Field>
                <FieldError :errors="[errors.convocation, errors.transition]" />
                <DialogFooter>
                    <DialogClose as-child>
                        <Button type="button" variant="outline"
                            >Cancelar</Button
                        >
                    </DialogClose>
                    <Button
                        type="submit"
                        :variant="
                            dialogs[pending].destructive
                                ? 'destructive'
                                : 'default'
                        "
                        :disabled="processing"
                    >
                        <Spinner v-if="processing" />
                        {{ dialogs[pending].label }}
                    </Button>
                </DialogFooter>
            </Form>
        </DialogContent>
    </Dialog>
</template>
