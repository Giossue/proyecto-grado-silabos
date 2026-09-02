<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { ref } from 'vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

/*
 * Pausar es lo que permite a la coordinación corregir su malla o sus fuentes: detiene a
 * los docentes de su carrera y a nadie más. Reanudar vuelve a protegerlas.
 */
const props = defineProps<{
    convocationId: string;
    transition: 'pausar' | 'reanudar';
}>();

const open = ref(false);

const copy = {
    pausar: {
        trigger: 'Pausar convocatoria',
        title: 'Pausar la convocatoria',
        description:
            'Los docentes de su carrera no podrán editar ni enviar hasta que la reanude; sus borradores se conservan. La malla y las fuentes quedan editables. El motivo queda en auditoría.',
        label: 'Pausar',
    },
    reanudar: {
        trigger: 'Reanudar convocatoria',
        title: 'Reanudar la convocatoria',
        description:
            'Los docentes vuelven a trabajar y la malla y las fuentes de la carrera quedan protegidas de nuevo.',
        label: 'Reanudar',
    },
}[props.transition];
</script>

<template>
    <Dialog v-model:open="open">
        <DialogTrigger as-child>
            <Button variant="outline">{{ copy.trigger }}</Button>
        </DialogTrigger>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ copy.title }}</DialogTitle>
                <DialogDescription>{{ copy.description }}</DialogDescription>
            </DialogHeader>
            <Form
                v-bind="
                    ConvocationController.transition.form({
                        convocation: convocationId,
                        transition,
                    })
                "
                v-slot="{ errors, processing }"
                class="flex flex-col gap-4"
                @success="open = false"
            >
                <Field
                    v-if="transition === 'pausar'"
                    :data-invalid="Boolean(errors.reason)"
                >
                    <FieldLabel for="convocation-pause-reason" required>
                        Motivo
                    </FieldLabel>
                    <Textarea
                        id="convocation-pause-reason"
                        name="reason"
                        rows="3"
                        :aria-invalid="Boolean(errors.reason)"
                        placeholder="Corrección de horas de dos materias de la malla antes de continuar."
                        required
                    />
                    <FieldError :errors="[errors.reason]" />
                </Field>
                <FieldError :errors="[errors.convocation, errors.transition]" />
                <DialogFooter>
                    <DialogClose as-child>
                        <Button type="button" variant="outline">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" />
                        {{ copy.label }}
                    </Button>
                </DialogFooter>
            </Form>
        </DialogContent>
    </Dialog>
</template>
