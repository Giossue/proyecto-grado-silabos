<script setup lang="ts">
import { Form, usePage } from '@inertiajs/vue3';
import { Check, Pencil } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldContent,
    FieldDescription,
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

const props = defineProps<{
    user: {
        id: string;
        nombre: string;
        correo_electronico: string;
        active: boolean;
    };
    roles: { codigo: string; nombre: string }[];
    careers: { id: string; nombre: string }[];
    /** `menu` lo dibuja como opción dentro del menú de tres puntos de una fila. */
    display?: 'button' | 'menu';
}>();

const open = defineModel<boolean>('open', { default: false });
const page = usePage();

// La política excluye la autogestión: la propia cuenta corrige su identidad, pero el
// estado y los roles los gestiona otra administración. Se ocultan esas secciones en
// lugar de dejar que el guardado falle en el servidor.
const editingSelf = computed(() => page.props.auth.user.id === props.user.id);

const description = computed(() =>
    editingSelf.value
        ? 'Corrija su nombre o su correo. El estado y los roles de la propia cuenta se gestionan desde otra cuenta de administración.'
        : `Corrija el nombre o el correo de ${props.user.nombre}, cambie el estado de la cuenta o asigne otro rol. El correo es con el que inicia sesión.`,
);

// Asignar un rol solo se envía cuando la persona lo pide expresamente, para que guardar
// el panel no multiplique asignaciones.
const assigningRole = ref(false);
const selectedRole = ref('docente');

watch(open, (isOpen) => {
    if (isOpen) {
        assigningRole.value = false;
        selectedRole.value = 'docente';
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar"
        title="Editar cuenta"
        :description="description"
        :show-trigger="props.display !== 'menu'"
    >
        <template #trigger>
            <Button variant="outline">Editar</Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="ManagedUserController.update.form(props.user.id)"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel
                            :for="`user-edit-name-${props.user.id}`"
                            required
                        >
                            Nombre completo
                        </FieldLabel>
                        <Input
                            :id="`user-edit-name-${props.user.id}`"
                            name="nombre"
                            :default-value="props.user.nombre"
                            placeholder="Ej. María Pérez"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.correo_electronico)">
                        <FieldLabel
                            :for="`user-edit-email-${props.user.id}`"
                            required
                        >
                            Correo institucional
                        </FieldLabel>
                        <Input
                            :id="`user-edit-email-${props.user.id}`"
                            name="correo_electronico"
                            type="email"
                            :default-value="props.user.correo_electronico"
                            placeholder="Ej. maria.perez@ueb.edu.ec"
                            required
                            :aria-invalid="Boolean(errors.correo_electronico)"
                        />
                        <FieldDescription>
                            Con este correo inicia sesión. Si lo cambia, avísele
                            antes de que intente entrar.
                        </FieldDescription>
                        <FieldError :errors="[errors.correo_electronico]" />
                    </Field>

                    <template v-if="!editingSelf">
                        <Field
                            orientation="horizontal"
                            :data-invalid="Boolean(errors.active)"
                        >
                            <input type="hidden" name="active" value="0" />
                            <Checkbox
                                :id="`user-edit-active-${props.user.id}`"
                                name="active"
                                value="1"
                                :default-value="props.user.active"
                                :aria-invalid="Boolean(errors.active)"
                            />
                            <FieldContent>
                                <FieldLabel
                                    :for="`user-edit-active-${props.user.id}`"
                                >
                                    Cuenta activa
                                </FieldLabel>
                                <FieldDescription>
                                    Sin marcar, la cuenta no puede iniciar
                                    sesión: al guardar se cierran sus sesiones
                                    abiertas y sus coordinaciones vigentes.
                                </FieldDescription>
                                <FieldError :errors="[errors.active]" />
                            </FieldContent>
                        </Field>

                        <Field orientation="horizontal">
                            <Checkbox
                                :id="`user-edit-assign-role-${props.user.id}`"
                                v-model="assigningRole"
                            />
                            <FieldContent>
                                <FieldLabel
                                    :for="`user-edit-assign-role-${props.user.id}`"
                                >
                                    Asignar otro rol
                                </FieldLabel>
                                <FieldDescription>
                                    Los roles activos se conservan; el nuevo se
                                    añade con su alcance.
                                </FieldDescription>
                            </FieldContent>
                        </Field>

                        <template v-if="assigningRole">
                            <Field :data-invalid="Boolean(errors.role_code)">
                                <FieldLabel
                                    :for="`user-edit-role-${props.user.id}`"
                                    required
                                >
                                    Rol
                                </FieldLabel>
                                <Select
                                    v-model="selectedRole"
                                    name="role_code"
                                    required
                                >
                                    <SelectTrigger
                                        :id="`user-edit-role-${props.user.id}`"
                                        :aria-invalid="
                                            Boolean(errors.role_code)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione un rol"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="role in roles"
                                                :key="role.codigo"
                                                :value="role.codigo"
                                            >
                                                {{ role.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.role_code]" />
                            </Field>

                            <Field
                                v-if="selectedRole !== 'administrador'"
                                :data-invalid="Boolean(errors.career_id)"
                            >
                                <FieldLabel
                                    :for="`user-edit-career-${props.user.id}`"
                                    required
                                >
                                    Carrera
                                </FieldLabel>
                                <Select name="career_id" required>
                                    <SelectTrigger
                                        :id="`user-edit-career-${props.user.id}`"
                                        :aria-invalid="
                                            Boolean(errors.career_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione una carrera"
                                        />
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

                        </template>
                    </template>

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
        Editar
    </DropdownMenuItem>
</template>
