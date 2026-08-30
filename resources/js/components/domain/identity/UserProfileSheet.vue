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
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const props = defineProps<{
    userId: string;
    name: string;
    email: string;
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
        :description="`Corrija el nombre o el correo de ${props.name}. El correo es con el que inicia sesión, así que cambiarlo cambia su forma de entrar.`"
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
                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel
                            :for="`profile-name-${props.userId}`"
                            required
                        >
                            Nombre completo
                        </FieldLabel>
                        <Input
                            :id="`profile-name-${props.userId}`"
                            name="name"
                            :default-value="props.name"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.email)">
                        <FieldLabel
                            :for="`profile-email-${props.userId}`"
                            required
                        >
                            Correo institucional
                        </FieldLabel>
                        <Input
                            :id="`profile-email-${props.userId}`"
                            name="email"
                            type="email"
                            :default-value="props.email"
                            required
                            :aria-invalid="Boolean(errors.email)"
                        />
                        <FieldDescription>
                            Con este correo inicia sesión. Si lo cambia, avísele
                            antes de que intente entrar.
                        </FieldDescription>
                        <FieldError :errors="[errors.email]" />
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
