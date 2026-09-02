<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { CalendarClock, Lock, Pause, Pencil, Play, Square } from '@lucide/vue';
import { ref } from 'vue';
import SyllabusProcessController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusProcessController';
import DeadlineExtensionSheet from '@/components/domain/syllabus/DeadlineExtensionSheet.vue';
import SyllabusProcessSheet from '@/components/domain/syllabus/SyllabusProcessSheet.vue';
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
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type Transition = 'abrir' | 'pausar' | 'reanudar' | 'cerrar';

defineProps<{
    process: {
        id: string;
        name: string;
        state: string;
        starts_at: string;
        due_at: string;
        configurable: boolean;
    };
    template: string | null;
}>();

const editOpen = ref(false);
const extensionOpen = ref(false);
const pending = ref<Transition | null>(null);

/*
 * Cada acción explica su consecuencia antes de confirmarla: abrir habilita a las
 * coordinaciones, pausar detiene a toda la universidad y cerrar no se deshace.
 */
const dialogs: Record<
    Transition,
    { title: string; description: string; label: string; destructive?: boolean }
> = {
    abrir: {
        title: 'Abrir el proceso',
        description:
            'Las coordinaciones podrán abrir sus convocatorias y los docentes empezarán a elaborar. Mientras esté abierto, la plantilla no se puede modificar.',
        label: 'Abrir proceso',
    },
    pausar: {
        title: 'Pausar el proceso',
        description:
            'Se detienen los envíos y la edición docente en todas las carreras hasta que lo reanude. La plantilla queda editable. El motivo queda en auditoría.',
        label: 'Pausar proceso',
    },
    reanudar: {
        title: 'Reanudar el proceso',
        description:
            'Los envíos vuelven a admitirse y la plantilla vuelve a quedar protegida. Las convocatorias que se abran desde ahora toman la plantilla vigente.',
        label: 'Reanudar proceso',
    },
    cerrar: {
        title: 'Cerrar el proceso',
        description:
            'Ningún sílabo de este proceso podrá enviarse después. Esta acción no se deshace.',
        label: 'Cerrar proceso',
        destructive: true,
    },
};
</script>

<template>
    <TableActionsMenu :label="`Acciones para ${process.name}`">
        <DropdownMenuItem v-if="process.configurable" @select="editOpen = true">
            <Pencil aria-hidden="true" />
            Editar
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="process.state === 'preparacion'"
            @select="pending = 'abrir'"
        >
            <Play aria-hidden="true" />
            Abrir
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="process.state === 'abierto'"
            @select="pending = 'pausar'"
        >
            <Pause aria-hidden="true" />
            Pausar
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="process.state === 'pausado'"
            @select="pending = 'reanudar'"
        >
            <Play aria-hidden="true" />
            Reanudar
        </DropdownMenuItem>
        <DropdownMenuItem
            v-if="process.state === 'abierto' || process.state === 'pausado'"
            @select="extensionOpen = true"
        >
            <CalendarClock aria-hidden="true" />
            Prorrogar plazo
        </DropdownMenuItem>
        <template
            v-if="process.state === 'abierto' || process.state === 'pausado'"
        >
            <DropdownMenuSeparator />
            <DropdownMenuItem
                variant="destructive"
                @select="pending = 'cerrar'"
            >
                <Square aria-hidden="true" />
                Cerrar
            </DropdownMenuItem>
        </template>
        <DropdownMenuItem v-if="process.state === 'cerrado'" disabled>
            <Lock aria-hidden="true" />
            Proceso cerrado
        </DropdownMenuItem>
    </TableActionsMenu>

    <DeadlineExtensionSheet
        v-model:open="extensionOpen"
        :process-id="process.id"
        display="menu"
    />

    <SyllabusProcessSheet
        v-model:open="editOpen"
        :template="template"
        :process="process"
        display="menu"
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
                <DialogDescription>
                    {{ dialogs[pending].description }}
                </DialogDescription>
            </DialogHeader>
            <Form
                v-bind="
                    SyllabusProcessController.transition.form({
                        process: process.id,
                        transition: pending,
                    })
                "
                v-slot="{ errors, processing }"
                class="flex flex-col gap-4"
                @success="pending = null"
            >
                <Field
                    v-if="pending === 'pausar'"
                    :data-invalid="Boolean(errors.reason)"
                >
                    <FieldLabel for="process-pause-reason" required>
                        Motivo
                    </FieldLabel>
                    <Textarea
                        id="process-pause-reason"
                        name="reason"
                        rows="3"
                        :aria-invalid="Boolean(errors.reason)"
                        placeholder="Corrección de la sección de evaluación en la plantilla."
                        required
                    />
                    <FieldError :errors="[errors.reason]" />
                </Field>
                <FieldError :errors="[errors.process, errors.transition]" />
                <DialogFooter>
                    <DialogClose as-child>
                        <Button type="button" variant="outline">
                            Cancelar
                        </Button>
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
