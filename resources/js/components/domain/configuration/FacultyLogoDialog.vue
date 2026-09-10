<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Save } from '@lucide/vue';
import FacultyLogoController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/FacultyLogoController';
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
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

defineProps<{
    facultyName: string;
    currentUrl: string;
    configured: boolean;
    size: { width: number; height: number };
}>();

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <Dialog v-model:open="open">
        <DialogContent class="sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>Logo de la facultad</DialogTitle>
                <DialogDescription>
                    Configure el encabezado de los sílabos de {{ facultyName }}.
                    Este paso es obligatorio antes de abrir la convocatoria.
                </DialogDescription>
            </DialogHeader>

            <Form
                v-bind="FacultyLogoController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                class="flex flex-col gap-5"
                @success="open = false"
            >
                <FieldGroup>
                    <div class="rounded-md border bg-white p-4">
                        <img
                            :src="currentUrl"
                            :alt="
                                configured
                                    ? `Logo actual de ${facultyName}`
                                    : 'Ejemplo del logo de facultad'
                            "
                            class="mx-auto max-h-28 max-w-full object-contain"
                        />
                    </div>

                    <Field :data-invalid="Boolean(errors.logo)">
                        <FieldLabel for="coordinator-faculty-logo" required>
                            Logo (PNG sin fondo)
                        </FieldLabel>
                        <Input
                            id="coordinator-faculty-logo"
                            name="logo"
                            type="file"
                            accept="image/png"
                            required
                            :disabled="processing"
                            :aria-invalid="Boolean(errors.logo)"
                        />
                        <FieldDescription>
                            Se ajustará a {{ size.width }} ×
                            {{ size.height }} px conservando su proporción.
                        </FieldDescription>
                        <FieldError
                            v-if="errors.logo"
                            :errors="[errors.logo]"
                        />
                    </Field>
                </FieldGroup>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="processing"
                        @click="open = false"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" data-icon="inline-start" />
                        <Save
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar logo
                    </Button>
                </DialogFooter>
            </Form>
        </DialogContent>
    </Dialog>
</template>
