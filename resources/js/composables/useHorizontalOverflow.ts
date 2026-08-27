import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';

export type UseHorizontalOverflowReturn = {
    /** Hay contenido oculto hacia la izquierda. */
    canScrollLeft: Ref<boolean>;
    /** Hay contenido oculto hacia la derecha. */
    canScrollRight: Ref<boolean>;
    /** El contenido no cabe: la región es desplazable. */
    overflows: Ref<boolean>;
    /** Recalcula tras un cambio que el observador no vea. */
    measure: () => void;
};

/**
 * Vigila si un contenedor esconde contenido a los lados.
 *
 * Una tabla ancha se desplaza sola, pero en un móvil la barra no se dibuja hasta que
 * alguien la arrastra, así que la columna cortada parece un defecto en vez de una
 * invitación. Con esto se puede señalar el borde por el que sigue habiendo datos.
 */
export function useHorizontalOverflow(
    element: Ref<HTMLElement | null>,
): UseHorizontalOverflowReturn {
    const canScrollLeft = ref(false);
    const canScrollRight = ref(false);
    const overflows = ref(false);

    // Un píxel de margen: los navegadores devuelven valores fraccionarios al hacer zoom y
    // el borde derecho quedaría marcado como desplazable estando al final.
    const EPSILON = 1;

    const measure = (): void => {
        const node = element.value;

        if (node === null) {
            return;
        }

        const maxScroll = node.scrollWidth - node.clientWidth;

        overflows.value = maxScroll > EPSILON;
        canScrollLeft.value = node.scrollLeft > EPSILON;
        canScrollRight.value = node.scrollLeft < maxScroll - EPSILON;
    };

    let observer: ResizeObserver | null = null;

    const observe = (node: HTMLElement): void => {
        node.addEventListener('scroll', measure, { passive: true });

        // El ancho cambia al plegar la barra lateral, al girar el teléfono y al llegar
        // otra página de resultados; ninguno de esos casos dispara un scroll.
        observer = new ResizeObserver(measure);
        observer.observe(node);

        for (const child of Array.from(node.children)) {
            observer.observe(child);
        }

        measure();
    };

    const unobserve = (node: HTMLElement): void => {
        node.removeEventListener('scroll', measure);
        observer?.disconnect();
        observer = null;
    };

    onMounted(() => {
        if (element.value !== null) {
            observe(element.value);
        }
    });

    watch(element, (node, previous) => {
        if (previous) {
            unobserve(previous);
        }

        if (node) {
            observe(node);
        }
    });

    onUnmounted(() => {
        if (element.value !== null) {
            unobserve(element.value);
        }
    });

    return { canScrollLeft, canScrollRight, overflows, measure };
}
