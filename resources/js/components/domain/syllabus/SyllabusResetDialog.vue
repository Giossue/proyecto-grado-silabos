<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { ref } from 'vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
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
 * «Ya lo presentó y justo cambió la base»: la coordinación descarta lo hecho y el
 * docente empieza de cero con la malla y la plantilla actuales. Lo enviado queda como
 * historial; lo que se pierde es el borrador, y por eso pide motivo.
 */
defineProps<{
    syllabusId: string;
    subject: string;
}>();

const open = ref(false);
</script>

<template>
    <Dialog v-model:open="open">
        <DialogTrigger as-child>
            <Button variant="outline">Reiniciar sílabo</Button>
        </DialogTrigger>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Reiniciar «{{ subject }}»</DialogTitle>
                <DialogDescription>
                    Se descarta el borrador actual y el sílabo vuelve a «Sin
                    iniciar» con la malla y la plantilla tal como están hoy. Las
                    revisiones ya enviadas se conservan como historial. El
                    docente recibe aviso y el motivo queda en auditoría.
                </DialogDescription>
            </DialogHeader>
            <Form
                v-bind="ReviewController.reset.form(syllabusId)"
                v-slot="{ errors, processing }"
                class="flex flex-col gap-4"
                @success="open = false"
            >
                <Field :data-invalid="Boolean(errors.reason)">
                    <FieldLabel for="syllabus-reset-reason" required
                        >Motivo</FieldLabel
                    >
                    <Textarea
                        id="syllabus-reset-reason"
                        name="reason"
                        rows="3"
                        :aria-invalid="Boolean(errors.reason)"
                        placeholder="La malla cambió las horas de la materia después de la entrega; se rehace sobre la base corregida."
                        required
                    />
                    <FieldError :errors="[errors.reason, errors.syllabus]" />
                </Field>
                <DialogFooter>
                    <DialogClose as-child>
                        <Button type="button" variant="outline"
                            >Cancelar</Button
                        >
                    </DialogClose>
                    <Button
                        type="submit"
                        variant="destructive"
                        :disabled="processing"
                    >
                        <Spinner v-if="processing" />
                        Reiniciar y descartar
                    </Button>
                </DialogFooter>
            </Form>
        </DialogContent>
    </Dialog>
</template>
