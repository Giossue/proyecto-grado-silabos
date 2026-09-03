<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Pencil } from '@lucide/vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const props = defineProps<{
    userId: string;
    nombre: string;
    correo_electronico: string;
    /** `menu` lo dibuja como opción dentro del menú de tres puntos de una fila. */
    display?: 'button' | 'menu';
}>();

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar datos"
        title="Editar datos de la cuenta"
        :description="`Corrija el nombre o el correo de ${props.nombre}. El correo es con el que inicia sesión, así que cambiarlo cambia su forma de entrar.`"
        :show-trigger="props.display !== 'menu'"
    >
        <template #trigger>
            <Button variant="outline">Editar datos</Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="ManagedUserController.updateProfile.form(props.userId)"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel
                            :for="`profile-name-${props.userId}`"
                            required
                        >
                            Nombre completo
                        </FieldLabel>
                        <Input
                            :id="`profile-name-${props.userId}`"
                            name="nombre"
                            :default-value="props.nombre"
                            placeholder="Ej. María Pérez"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.correo_electronico)">
                        <FieldLabel
                            :for="`profile-email-${props.userId}`"
                            required
                        >
                            Correo institucional
                        </FieldLabel>
                        <Input
                            :id="`profile-email-${props.userId}`"
                            name="correo_electronico"
                            type="email"
                            :default-value="props.correo_electronico"
                            placeholder="Ej. maria.perez@ueb.edu.ec"
                            required
                            :aria-invalid="Boolean(errors.correo_electronico)"
                        />
                        <FieldError :errors="[errors.correo_electronico]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar cambios"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>

    <!--
        Dentro de un menú, la opción y el panel se separan: si el panel viviera dentro del
        elemento del menú, cerrar el menú lo desmontaría a media edición.
    -->
    <DropdownMenuItem
        v-if="props.display === 'menu'"
        @select="
            (event: Event) => {
                event.preventDefault();
                open = true;
            }
        "
    >
        <Pencil aria-hidden="true" />
        Editar datos
    </DropdownMenuItem>
</template>
