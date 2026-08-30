<script setup lang="ts">
import { ListFilter, X } from '@lucide/vue';
import { onBeforeUnmount, ref, useAttrs, useTemplateRef, watch } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Dos raíces —el disparador y el panel—, así que Vue no sabe a cuál aplicar la clase que
// llega de fuera. Se dirige a mano al panel, que es quien define el reparto en ancho.
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

/**
 * Agrupa los filtros de una tabla tras un botón cuando la pantalla es estrecha.
 *
 * No usa el `Sheet` de la librería a propósito: aquel lleva su contenido al `body`
 * mediante un portal, y los campos que viajan fuera del formulario dejan de enviarse.
 * Aquí el contenido permanece donde estaba y solo cambia cómo se presenta, así que sirve
 * igual para los filtros que consultan al servidor y para los que filtran en el navegador.
 */
const open = ref(false);
const activeCount = ref(0);
const panel = useTemplateRef<HTMLElement>('panel');

/**
 * Cuenta los filtros puestos mirando los campos que hay dentro. Los desplegables de la
 * interfaz dejan un `select` nativo oculto para poder enviarse, y `all` es el valor que
 * significa «sin filtrar».
 */
const recount = (): void => {
    const node = panel.value;

    if (node === null) {
        return;
    }

    activeCount.value = Array.from(
        node.querySelectorAll<HTMLSelectElement | HTMLInputElement>(
            'select, input[type="hidden"]',
        ),
    ).filter((field) => field.value !== '' && field.value !== 'all').length;
};

const close = (): void => {
    open.value = false;
};

const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
        close();
    }
};

watch(open, (isOpen) => {
    if (isOpen) {
        recount();
        window.addEventListener('keydown', onKey);
        // Sin esto la lista de detrás sigue desplazándose bajo el panel.
        document.body.style.overflow = 'hidden';

        return;
    }

    window.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
});
</script>

<template>
    <!-- En pantalla ancha no hay botón ni panel: los filtros se ven en fila. -->
    <div class="contents sm:hidden">
        <Button
            type="button"
            variant="outline"
            class="w-full"
            :aria-expanded="open"
            @click="
                open = true;
                recount();
            "
        >
            <ListFilter data-icon="inline-start" aria-hidden="true" />
            Filtros
            <Badge v-if="activeCount > 0" variant="secondary" class="ml-1">
                {{ activeCount }}
            </Badge>
        </Button>

        <div
            v-show="open"
            class="fixed inset-0 z-50 bg-black/50"
            aria-hidden="true"
            @click="close"
        />
    </div>

    <div
        ref="panel"
        :class="
            cn(
                // El reparto en pantalla ancha lo decide quien usa el componente.
                attrs.class as string,
                // Estrecho: panel que baja desde arriba, sobre el resto.
                'max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-50 max-sm:max-h-[85vh]',
                'max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:overflow-hidden',
                'max-sm:rounded-b-xl max-sm:bg-card max-sm:p-4',
                // Por debajo de la barra de estado, no detrás de ella.
                'max-sm:pt-[calc(1rem+env(safe-area-inset-top))]',
                'max-sm:shadow-modal max-sm:ring-1 max-sm:ring-surface-ring',
                !open && 'max-sm:hidden',
            )
        "
        role="group"
        aria-label="Filtros de la tabla"
        @change="recount"
    >
        <div class="flex items-center justify-between sm:hidden">
            <span class="flex items-center gap-2 font-medium">
                <ListFilter class="size-4" aria-hidden="true" />
                Filtros
            </span>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar filtros"
                @click="close"
            >
                <X aria-hidden="true" />
            </Button>
        </div>

        <div
            class="max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto sm:contents"
        >
            <slot />
        </div>

        <!--
            Los filtros ya se aplicaron al elegirlos, igual que en pantalla ancha. Este
            botón solo cierra: mantener dos formas de aplicar llevaría a que alguien
            eligiera, viera la lista cambiar detrás y aun así dudara de si hizo falta
            confirmar.
        -->
        <Button
            type="button"
            class="mt-2 w-full shrink-0 sm:hidden"
            @click="close"
        >
            Ver resultados
        </Button>
    </div>
</template>
