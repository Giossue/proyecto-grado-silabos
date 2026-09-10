<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Copy, Eye, EyeOff, RefreshCw, UserPlus } from '@lucide/vue';
import { ref, watch } from 'vue';
import CareerTeacherController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/CareerTeacherController';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import {
    Field,
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
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { generateTemporaryPassword } from '@/lib/temporaryPassword';

withDefaults(
    defineProps<{
        roles?: { codigo: string; nombre: string }[];
        careers?: { id: string; nombre: string }[];
        teacherCareer?: { id: string; name: string };
        showTrigger?: boolean;
    }>(),
    { roles: () => [], careers: () => [], showTrigger: true },
);

const initialRole = ref('docente');

// La contraseña se genera aquí sin pedir confirmación: quien crea la cuenta no la
// escribió. Permanece oculta hasta que se solicite verla con el control accesible.
const password = ref(generateTemporaryPassword());
const copied = ref(false);
const passwordVisible = ref(false);

const regenerate = (): void => {
    password.value = generateTemporaryPassword();
    copied.value = false;
    passwordVisible.value = false;
};

const copy = async (): Promise<void> => {
    try {
        await navigator.clipboard.writeText(password.value);
        copied.value = true;
    } catch {
        // Sin portapapeles disponible el valor sigue visible y se puede copiar a mano.
        copied.value = false;
    }
};

// Cada apertura del panel estrena contraseña: así dos cuentas creadas seguidas nunca
// comparten la misma y no queda a la vista la de la cuenta anterior.
const open = defineModel<boolean>('open', { default: false });

watch(open, (isOpen) => {
    if (isOpen) {
        regenerate();
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        :trigger-label="teacherCareer ? 'Crear docente' : 'Crear cuenta'"
        :title="
            teacherCareer
                ? 'Crear docente para su carrera'
                : 'Crear cuenta institucional'
        "
        :description="
            teacherCareer
                ? `Registre un docente para ${teacherCareer.name}. Si el correo ya tiene una cuenta, se incorporará conservando su nombre y acceso actuales.`
                : 'Registre una cuenta con su rol inicial, carrera y contraseña temporal. La contraseña no se guarda en auditoría ni logs.'
        "
        :show-trigger="showTrigger"
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    teacherCareer
                        ? CareerTeacherController.store.form()
                        : ManagedUserController.store.form()
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field v-if="teacherCareer">
                        <FieldLabel for="teacher-scope"
                            >Rol y carrera</FieldLabel
                        >
                        <Input
                            id="teacher-scope"
                            :model-value="`Docente · ${teacherCareer.name}`"
                            placeholder="Ej. Docente · Software"
                            readonly
                        />
                    </Field>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel for="managed-name" required>
                            Nombre completo
                        </FieldLabel>
                        <Input
                            id="managed-name"
                            name="nombre"
                            placeholder="Ej. MARÍA JOSÉ PÉREZ LÓPEZ"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.correo_electronico)">
                        <FieldLabel for="managed-email" required>
                            Correo institucional
                        </FieldLabel>
                        <Input
                            id="managed-email"
                            name="correo_electronico"
                            type="email"
                            placeholder="Ej. maria.perez@ueb.edu.ec"
                            required
                            :aria-invalid="Boolean(errors.correo_electronico)"
                        />
                        <FieldError :errors="[errors.correo_electronico]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.password)">
                        <FieldLabel for="managed-password" required>
                            Contraseña temporal
                        </FieldLabel>
                        <div class="flex items-center gap-2">
                            <div class="relative flex-1">
                                <Input
                                    id="managed-password"
                                    v-model="password"
                                    name="password"
                                    :type="
                                        passwordVisible ? 'text' : 'password'
                                    "
                                    placeholder="Ej. UEB-Temporal-2026"
                                    readonly
                                    required
                                    class="pr-10 font-mono"
                                    autocomplete="off"
                                    :aria-invalid="Boolean(errors.password)"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    class="absolute inset-y-0 right-0 h-full w-9"
                                    :aria-label="
                                        passwordVisible
                                            ? 'Ocultar contraseña'
                                            : 'Mostrar contraseña'
                                    "
                                    :aria-pressed="passwordVisible"
                                    @click="passwordVisible = !passwordVisible"
                                >
                                    <EyeOff
                                        v-if="passwordVisible"
                                        aria-hidden="true"
                                    />
                                    <Eye v-else aria-hidden="true" />
                                </Button>
                            </div>
                            <Tooltip>
                                <TooltipTrigger as-child>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label="Generar otra contraseña"
                                        @click="regenerate"
                                    >
                                        <RefreshCw aria-hidden="true" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Generar otra</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger as-child>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        :aria-label="
                                            copied
                                                ? 'Contraseña copiada'
                                                : 'Copiar contraseña'
                                        "
                                        @click="copy"
                                    >
                                        <Check
                                            v-if="copied"
                                            aria-hidden="true"
                                        />
                                        <Copy v-else aria-hidden="true" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {{ copied ? 'Copiada' : 'Copiar' }}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <FieldError :errors="[errors.password]" />
                        <FieldDescription v-if="teacherCareer">
                            La contraseña temporal solo se usará si la cuenta es
                            nueva.
                        </FieldDescription>
                    </Field>
                    <Field
                        v-if="!teacherCareer"
                        :data-invalid="Boolean(errors.role_code)"
                    >
                        <FieldLabel for="managed-role" required>
                            Rol inicial
                        </FieldLabel>
                        <Select v-model="initialRole" name="role_code" required>
                            <SelectTrigger
                                id="managed-role"
                                :aria-invalid="Boolean(errors.role_code)"
                            >
                                <SelectValue placeholder="Seleccione un rol" />
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
                        v-if="!teacherCareer && initialRole !== 'administrador'"
                        :data-invalid="Boolean(errors.career_id)"
                    >
                        <FieldLabel for="managed-career" required>
                            Carrera
                        </FieldLabel>
                        <Select name="career_id" required>
                            <SelectTrigger
                                id="managed-career"
                                :aria-invalid="Boolean(errors.career_id)"
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
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserPlus"
                        :label="
                            teacherCareer
                                ? 'Crear o incorporar docente'
                                : 'Crear cuenta'
                        "
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
