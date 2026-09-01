<script setup lang="ts">
import { Form, Link, router, usePage } from '@inertiajs/vue3';
import { LogOut } from '@lucide/vue';
import { computed } from 'vue';
import SecurityController from '@/actions/App/Http/Controllers/Settings/SecurityController';
import InputError from '@/components/InputError.vue';
import PasswordInput from '@/components/PasswordInput.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { logout } from '@/routes';

const page = usePage();

// La marca viaja en el usuario compartido. El servidor bloquea igual cada ruta: este
// diálogo es la salida visible del bloqueo, no el bloqueo en sí.
const required = computed(
    () => page.props.auth.user?.debe_cambiar_contrasena === true,
);

// El diálogo no se cierra: sin botón, sin «Esc» y sin clic fuera. La única alternativa a
// cambiar la contraseña es cerrar sesión.
const block = (event: Event): void => {
    event.preventDefault();
};

const onLogout = (): void => {
    router.flushAll();
};
</script>

<template>
    <Dialog :open="required">
        <DialogContent
            class="sm:max-w-md"
            :show-close-button="false"
            @escape-key-down="block"
            @interact-outside="block"
            @pointer-down-outside="block"
            @focus-outside="block"
        >
            <DialogHeader>
                <DialogTitle>Cambie su contraseña temporal</DialogTitle>
                <DialogDescription>
                    La contraseña con la que entró la generó quien creó su
                    cuenta. Defina una propia para continuar.
                </DialogDescription>
            </DialogHeader>
            <Form
                v-bind="SecurityController.update.form()"
                v-slot="{ errors, processing }"
                :reset-on-error="[
                    'current_password',
                    'password',
                    'password_confirmation',
                ]"
                class="space-y-4"
            >
                <div class="grid gap-2">
                    <Label for="temporary-current-password" required>
                        Contraseña temporal
                    </Label>
                    <PasswordInput
                        id="temporary-current-password"
                        name="current_password"
                        autocomplete="current-password"
                        required
                    />
                    <InputError :message="errors.current_password" />
                </div>
                <div class="grid gap-2">
                    <Label for="temporary-new-password" required>
                        Contraseña nueva
                    </Label>
                    <PasswordInput
                        id="temporary-new-password"
                        name="password"
                        autocomplete="new-password"
                        required
                    />
                    <InputError :message="errors.password" />
                </div>
                <div class="grid gap-2">
                    <Label for="temporary-password-confirmation" required>
                        Confirmar contraseña nueva
                    </Label>
                    <PasswordInput
                        id="temporary-password-confirmation"
                        name="password_confirmation"
                        autocomplete="new-password"
                        required
                    />
                    <InputError :message="errors.password_confirmation" />
                </div>
                <div class="flex items-center justify-between gap-4 pt-2">
                    <Link
                        :href="logout()"
                        as="button"
                        type="button"
                        class="inline-flex cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground"
                        @click="onLogout"
                    >
                        <LogOut class="mr-2 size-4" />
                        Cerrar sesión
                    </Link>
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" />
                        Guardar y continuar
                    </Button>
                </div>
            </Form>
        </DialogContent>
    </Dialog>
</template>
