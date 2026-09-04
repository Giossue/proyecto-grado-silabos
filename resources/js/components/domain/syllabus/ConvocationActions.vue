<script setup lang="ts">
import { Form, Link } from '@inertiajs/vue3';
import { Eye, Lock, Pause, Play } from '@lucide/vue';
import { ref } from 'vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
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

type Transition = 'iniciar' | 'abrir' | 'pausar' | 'reanudar';

/*
 * Todo lo que se hace con una convocatoria vive en su menú de tres puntos, como en
 * Administración: iniciar, ver seguimiento, pausar y reanudar. Prorrogar y cerrar
 * son del calendario institucional y viven en Administración.
 * Cada acción explica su consecuencia antes de confirmarla.
 */
const props = defineProps<{
    convocation: {
        id: string | null;
        process_id: string;
        name: string;
        state: string;
        process_state: string;
    };
}>();

const pending = ref<Transition | null>(null);

const dialogs: Record<
    Transition,
    { title: string; description: string; label: string; destructive?: boolean }
> = {
    iniciar: {
        title: 'Iniciar convocatoria de la carrera',
        description:
            'Se comprobarán la malla, las ofertas, la asignación docente y las fuentes académicas de su carrera. Se generará un sílabo por paralelo usando la plantilla y las fechas institucionales. Si falta algún requisito, no se iniciará la convocatoria.',
        label: 'Iniciar convocatoria',
    },
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

const transitionForm = (transition: Transition) => {
    if (transition === 'iniciar') {
        return ConvocationController.store.form();
    }

    const id = props.convocation.id;

    if (id === null) {
        throw new Error('La convocatoria de carrera aún no existe.');
    }

    return transition === 'abrir'
        ? ConvocationController.open.form(id)
        : ConvocationController.transition.form({
              convocation: id,
              transition,
          });
};
</script>

<template>
    <TableActionsMenu :label="`Acciones para ${convocation.name}`">
        <DropdownMenuItem
            v-if="convocation.id === null"
            :disabled="convocation.process_state !== 'abierto'"
            @select="pending = 'iniciar'"
        >
            <Play aria-hidden="true" />
            Iniciar
        </DropdownMenuItem>
        <DropdownMenuItem v-if="convocation.id !== null" as-child>
            <Link :href="ConvocationController.show(convocation.id)">
                <Eye aria-hidden="true" />
                Ver seguimiento
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="convocation.state === 'preparacion'"
            :disabled="convocation.process_state !== 'abierto'"
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
            :disabled="convocation.process_state !== 'abierto'"
            @select="pending = 'reanudar'"
        >
            <Play aria-hidden="true" />
            Reanudar
        </DropdownMenuItem>
        <DropdownMenuItem v-if="convocation.state === 'cerrada'" disabled>
            <Lock aria-hidden="true" />
            Convocatoria cerrada
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="convocation.process_state !== 'abierto'"
            disabled
        >
            <Lock aria-hidden="true" />
            {{
                convocation.process_state === 'pausado'
                    ? 'Proceso institucional en pausa'
                    : convocation.process_state === 'cerrado'
                      ? 'Proceso institucional cerrado'
                      : 'Pendiente de apertura institucional'
            }}
        </DropdownMenuItem>
    </TableActionsMenu>

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
                v-bind="transitionForm(pending)"
                v-slot="{ errors, processing }"
                class="flex flex-col gap-4"
                @success="pending = null"
            >
                <input
                    v-if="pending === 'iniciar'"
                    type="hidden"
                    name="process_id"
                    :value="convocation.process_id"
                />
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
                <FieldError
                    :errors="[
                        errors.process_id,
                        errors.convocation,
                        errors.transition,
                    ]"
                />
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
