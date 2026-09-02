<script setup lang="ts">
import { Plus, X } from '@lucide/vue';
import type { VNode } from 'vue';
import {
    computed,
    Fragment,
    onUnmounted,
    ref,
    useSlots,
    watch,
    watchEffect,
} from 'vue';
import { Button } from '@/components/ui/button';
import { useCurrentUrl } from '@/composables/useCurrentUrl';
import { usePageTitle } from '@/composables/usePageBreadcrumbs';
import { useScrollDirection } from '@/composables/useScrollDirection';
import { cn } from '@/lib/utils';

const props = withDefaults(
    defineProps<{
        title: string;
        description: string;
        size?: 'full' | 'wide' | 'narrow';
    }>(),
    {
        size: 'full',
    },
);

const widthClass = computed(
    () =>
        ({
            full: '',
            wide: 'mx-auto w-full max-w-6xl',
            narrow: 'mx-auto w-full max-w-4xl',
        })[props.size],
);

/*
 * El nombre de la pantalla se entrega al encabezado, que es quien lo dibuja. Aquí no se
 * pinta: decirlo en la miga y otra vez como título era decirlo dos veces seguidas.
 */
const pageTitle = usePageTitle();

watchEffect(() => {
    pageTitle.value = props.title;
});

// Al salir de la pantalla, el encabezado no debe seguir anunciándola.
onUnmounted(() => {
    pageTitle.value = '';
});

const slots = useSlots();

/**
 * Los fragmentos y los `v-if` que no se cumplen aparecen en el árbol del slot, así que
 * contar los nodos tal cual daría acciones que no existen. Se aplanan los fragmentos y se
 * descartan los comentarios, que es en lo que se convierte un `v-if` falso.
 */
const countActions = (nodes: VNode[]): number =>
    nodes.reduce((total, node) => {
        if (node.type === Fragment) {
            return total + countActions((node.children ?? []) as VNode[]);
        }

        // Un `v-if` sin cumplir deja un comentario, y los comentarios son símbolos igual
        // que los fragmentos; descartados los fragmentos arriba, el resto no cuenta.
        if (typeof node.type === 'symbol') {
            return total;
        }

        return total + 1;
    }, 0);

const actionCount = computed(() => countActions(slots.actions?.() ?? []));

// Con una sola acción el propio botón hace de botón flotante. Con varias hace falta un
// disparador que las despliegue, o taparían media pantalla.
const needsTrigger = computed(() => actionCount.value > 1);

const expanded = ref(false);
const { hidden } = useScrollDirection();
const { currentUrl } = useCurrentUrl();

// Navegar deja el desplegable abierto sobre una pantalla que ya no es la suya.
watch(currentUrl, () => {
    expanded.value = false;
});

// Mientras está desplegado no se esconde: taparía las opciones a medio elegir.
const floatingHidden = computed(() => hidden.value && !expanded.value);
</script>

<template>
    <div
        :class="
            cn(
                'flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6',
                // Sitio para que el botón flotante no tape la última fila de una tabla.
                $slots.actions &&
                    'max-sm:pb-[calc(6rem+env(safe-area-inset-bottom))]',
                widthClass,
            )
        "
    >
        <header
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
            <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div v-if="$slots.eyebrow" class="-mt-1">
                    <slot name="eyebrow" />
                </div>

                <p class="max-w-3xl text-muted-foreground">
                    {{ description }}
                </p>
                <div
                    v-if="$slots.meta"
                    class="flex flex-wrap items-center gap-2 pt-1"
                >
                    <slot name="meta" />
                </div>
            </div>

            <!--
                Una sola instancia del slot para las dos presentaciones: duplicarlo
                repetiría identificadores y estados de formulario. En pantalla ancha es una
                fila en el encabezado; en móvil, una pila flotante abajo a la derecha.
            -->
            <div
                v-if="$slots.actions"
                :class="
                    cn(
                        'flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end',
                        // Columna normal, no invertida: el disparador es el último del DOM y así queda
                        // abajo, al alcance del pulgar, con las opciones desplegándose hacia arriba.
                        // Separado del borde por la franja del sistema —la barra de
                        // gestos, la rayita del inicio— además de su propio margen. Hoy
                        // esa franja mide cero porque la página no se dibuja debajo de
                        // ella; el día que alguien lo permita, el botón no queda tapado.
                        'max-sm:fixed max-sm:z-40 max-sm:w-auto max-sm:flex-col max-sm:items-end',
                        'max-sm:right-[calc(1rem+env(safe-area-inset-right))] max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]',
                        'max-sm:transition-all max-sm:duration-200 max-sm:ease-out',
                        floatingHidden &&
                            'max-sm:pointer-events-none max-sm:translate-y-24 max-sm:opacity-0',
                    )
                "
            >
                <div
                    :class="
                        cn(
                            'contents',
                            // Las acciones se apilan sobre el disparador y solo existen
                            // cuando está desplegado.
                            needsTrigger &&
                                !expanded &&
                                'max-sm:hidden max-sm:[&>*]:hidden',
                            'max-sm:[&>*]:shadow-menu',
                        )
                    "
                >
                    <slot name="actions" />
                </div>

                <Button
                    v-if="needsTrigger"
                    type="button"
                    class="size-14 rounded-full p-0 shadow-menu sm:hidden"
                    :aria-expanded="expanded"
                    :aria-label="
                        expanded
                            ? 'Cerrar acciones de la pantalla'
                            : `Ver ${actionCount} acciones de la pantalla`
                    "
                    @click="expanded = !expanded"
                >
                    <component :is="expanded ? X : Plus" aria-hidden="true" />
                </Button>
            </div>
        </header>

        <slot />
    </div>
</template>
