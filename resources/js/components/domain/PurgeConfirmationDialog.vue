<script setup lang="ts">
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { usePurgeConfirmation } from '@/composables/usePurgeConfirmation';

/*
 * Un solo diálogo para toda la aplicación: aparece cuando el servidor avisa que un
 * cambio va a borrar sílabos en curso. Confirmar repite la petición ya confirmada.
 */
const { open, message, confirm, cancel } = usePurgeConfirmation();
</script>

<template>
    <Dialog
        :open="open"
        @update:open="
            (isOpen) => {
                if (!isOpen) cancel();
            }
        "
    >
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Este cambio borra trabajo en curso</DialogTitle>
                <DialogDescription>{{ message }}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button type="button" variant="outline" @click="cancel">
                    Cancelar
                </Button>
                <Button type="button" variant="destructive" @click="confirm">
                    Borrar y guardar
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
