<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { Save } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

const props = defineProps<{
    templateId: string;
    title: string;
}>();

const open = ref(false);
const form = useForm({ title: props.title });

const openEdit = (): void => {
    form.clearErrors();
    form.title = props.title;
    open.value = true;
};

const save = (): void => {
    form.patch(TemplateController.updateTitle.url(props.templateId), {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Título actualizado.');
            open.value = false;
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ??
                        'No se pudo actualizar el título.',
                );
            }
        },
    });
};

defineExpose({ openEdit });
</script>

<template>
    <Dialog v-model:open="open">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Editar título principal</DialogTitle>
                <DialogDescription>
                    Este bloque es único y siempre aparece al inicio del
                    documento.
                </DialogDescription>
            </DialogHeader>
            <form class="flex flex-col gap-4" @submit.prevent="save">
                <FieldGroup>
                    <Field :data-invalid="Boolean(form.errors.title)">
                        <FieldLabel for="template-document-title" required>
                            Título
                        </FieldLabel>
                        <Input
                            id="template-document-title"
                            v-model="form.title"
                            maxlength="180"
                            placeholder="Ej. Programa de asignatura (sílabo)"
                            :disabled="form.processing"
                            :aria-invalid="Boolean(form.errors.title)"
                        />
                        <FieldError
                            v-if="form.errors.title"
                            :errors="[form.errors.title]"
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="open = false"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="form.processing">
                        <Spinner
                            v-if="form.processing"
                            data-icon="inline-start"
                        />
                        <Save
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar título
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
