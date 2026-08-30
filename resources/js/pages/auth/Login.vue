<script setup lang="ts">
import { Form, Head } from '@inertiajs/vue3';
import PasswordInput from '@/components/PasswordInput.vue';
import TextLink from '@/components/TextLink.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

defineOptions({
    layout: {
        title: 'Iniciar sesión',
        description: 'Ingrese con la cuenta asignada por la institución.',
    },
});

defineProps<{
    status?: string;
    canResetPassword: boolean;
}>();
</script>

<template>
    <Head title="Iniciar sesión" />

    <div
        v-if="status"
        class="mb-4 text-center text-sm font-medium text-foreground"
    >
        {{ status }}
    </div>

    <Form
        v-bind="store.form()"
        :reset-on-success="['password']"
        v-slot="{ errors, processing }"
        class="flex flex-col gap-6"
    >
        <FieldGroup>
            <Field :data-invalid="Boolean(errors.email)">
                <FieldLabel for="email" required>
                    Correo institucional
                </FieldLabel>
                <Input
                    id="email"
                    type="email"
                    name="email"
                    required
                    autocomplete="email"
                    placeholder="nombre@ueb.edu.ec"
                    :aria-invalid="Boolean(errors.email)"
                />
                <FieldError :errors="[errors.email]" />
            </Field>

            <Field :data-invalid="Boolean(errors.password)">
                <div class="flex items-center justify-between">
                    <FieldLabel for="password" required>
                        Contraseña
                    </FieldLabel>
                    <TextLink
                        v-if="canResetPassword"
                        :href="request()"
                        class="text-sm"
                    >
                        ¿Olvidó su contraseña?
                    </TextLink>
                </div>
                <PasswordInput
                    id="password"
                    name="password"
                    required
                    autocomplete="current-password"
                    placeholder="Contraseña"
                    :aria-invalid="Boolean(errors.password)"
                />
                <FieldError :errors="[errors.password]" />
            </Field>

            <Field orientation="horizontal">
                <Checkbox id="remember" name="remember" />
                <FieldLabel for="remember" class="font-normal"
                    >Mantener la sesión iniciada</FieldLabel
                >
            </Field>

            <Button
                type="submit"
                class="mt-4 w-full"
                :disabled="processing"
                data-test="login-button"
            >
                <Spinner v-if="processing" />
                Ingresar
            </Button>
        </FieldGroup>
    </Form>
</template>
