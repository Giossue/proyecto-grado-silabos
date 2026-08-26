<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import FormSheet from '@/components/domain/FormSheet.vue';
import { Button } from '@/components/ui/button';
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
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

defineProps<{
    careers: { id: string; nombre: string }[];
}>();
</script>

<template>
    <FormSheet
        trigger-label="Nueva plantilla"
        title="Nueva plantilla de sílabo"
        description="Se crearán las doce áreas funcionales base en una versión borrador. Después podrá completar su estructura en el constructor."
    >
        <template #default="{ close }">
            <Form
                v-bind="TemplateController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel for="template-name">Nombre</FieldLabel>
                        <Input
                            id="template-name"
                            name="name"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.career_id)">
                        <FieldLabel for="template-career">
                            Carrera (opcional)
                        </FieldLabel>
                        <Select name="career_id">
                            <SelectTrigger
                                id="template-career"
                                :aria-invalid="Boolean(errors.career_id)"
                            >
                                <SelectValue placeholder="Alcance general" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="career in careers"
                                        :key="career.id"
                                        :value="career.id"
                                    >
                                        {{ career.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.career_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.description)">
                        <FieldLabel for="template-description">
                            Descripción
                        </FieldLabel>
                        <Textarea
                            id="template-description"
                            name="description"
                            :aria-invalid="Boolean(errors.description)"
                        />
                        <FieldError :errors="[errors.description]" />
                    </Field>

                    <Field orientation="horizontal">
                        <Button type="submit" :disabled="processing">
                            <Spinner v-if="processing" />
                            Crear y abrir constructor
                        </Button>
                    </Field>
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
