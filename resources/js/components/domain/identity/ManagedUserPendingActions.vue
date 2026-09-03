<script setup lang="ts">
import { Form, router } from '@inertiajs/vue3';
import { MailCheck, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';

/**
 * Lo que solo tiene sentido mientras nadie ha estrenado la cuenta: volver a enviar el
 * acceso (nueva contraseña temporal al correo actual) y borrarla si no dejó rastro.
 */
const props = defineProps<{
    userId: string;
    userName: string;
    userEmail: string;
}>();

const deleteOpen = ref(false);

const resend = (): void => {
    router.post(
        ManagedUserController.resendCredentials.url(props.userId),
        {},
        { preserveScroll: true },
    );
};
</script>

<template>
    <DropdownMenuItem @select="resend">
        <MailCheck aria-hidden="true" />
        Reenviar acceso
    </DropdownMenuItem>
    <DropdownMenuItem variant="destructive" @select="deleteOpen = true">
        <Trash2 aria-hidden="true" />
        Eliminar
    </DropdownMenuItem>

    <Dialog v-model:open="deleteOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Eliminar la cuenta de {{ userName }}</DialogTitle>
                <DialogDescription>
                    Se borra la cuenta ({{ userEmail }}) con su rol. Solo es
                    posible mientras nadie la haya activado ni tenga actividad;
                    si ya tiene historia, archívela.
                </DialogDescription>
            </DialogHeader>
            <Form
                v-bind="ManagedUserController.destroy.form(userId)"
                v-slot="{ errors, processing }"
                :options="{ preserveScroll: true }"
                @success="deleteOpen = false"
            >
                <p v-if="errors.user" class="mb-4 text-sm text-destructive">
                    {{ errors.user }}
                </p>
                <DialogFooter>
                    <DialogClose as-child>
                        <Button type="button" variant="outline">
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button
                        type="submit"
                        variant="destructive"
                        :disabled="processing"
                    >
                        <Spinner v-if="processing" />
                        Eliminar cuenta
                    </Button>
                </DialogFooter>
            </Form>
        </DialogContent>
    </Dialog>
</template>
