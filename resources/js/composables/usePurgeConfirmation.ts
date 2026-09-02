import type { PendingVisit } from '@inertiajs/core';
import { router } from '@inertiajs/vue3';
import { readonly, ref } from 'vue';

/*
 * Cuando un cambio en la plantilla o en la malla va a borrar sílabos en curso, el
 * servidor no lo aplica: responde con `purge_required` y la cifra. Aquí se captura esa
 * respuesta, se pregunta una sola vez y, si la persona confirma, se repite la misma
 * petición con `confirm_purge`. Así ningún formulario tiene que saber que existe el
 * borrado: basta con que el servidor lo pida.
 */
const open = ref(false);
const message = ref('');
const count = ref(0);
let lastVisit: PendingVisit | null = null;
let installed = false;

const withConfirmation = (data: PendingVisit['data']): PendingVisit['data'] => {
    if (data instanceof FormData) {
        data.set('confirm_purge', '1');

        return data;
    }

    return { ...(data as Record<string, unknown>), confirm_purge: 1 };
};

export function usePurgeConfirmation() {
    if (!installed) {
        installed = true;
        router.on('before', (event) => {
            lastVisit = event.detail.visit;
        });
        router.on('error', (event) => {
            const errors = event.detail.errors as Record<string, string>;

            if (!errors.purge_required) {
                return;
            }

            message.value = errors.purge_required;
            count.value = Number(errors.purge_count ?? 0);
            open.value = true;
        });
    }

    const confirm = (): void => {
        open.value = false;

        if (lastVisit === null) {
            return;
        }

        router.visit(lastVisit.url, {
            method: lastVisit.method,
            data: withConfirmation(lastVisit.data),
            preserveScroll: true,
            preserveState: true,
        });
    };

    const cancel = (): void => {
        open.value = false;
    };

    return {
        open,
        message: readonly(message),
        count: readonly(count),
        confirm,
        cancel,
    };
}
