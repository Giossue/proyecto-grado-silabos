import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref } from 'vue';

export type UseScrollDirectionOptions = {
    /** Píxeles de recorrido antes de reaccionar, para que un temblor no dispare nada. */
    threshold?: number;
    /** Zona superior donde el botón siempre se muestra, aunque se baje. */
    topOffset?: number;
};

export type UseScrollDirectionReturn = {
    /** Verdadero mientras se baja: la superficie flotante se aparta del contenido. */
    hidden: Ref<boolean>;
};

/**
 * Detecta si la página va hacia abajo o hacia arriba para ocultar y devolver una
 * superficie flotante. Es el comportamiento que se espera de un botón de acción en móvil:
 * estorba menos al leer y vuelve en cuanto se busca.
 *
 * Se escucha en `window` porque el documento es quien desplaza; `SidebarInset` no declara
 * desbordamiento propio.
 */
export function useScrollDirection(
    options: UseScrollDirectionOptions = {},
): UseScrollDirectionReturn {
    const { threshold = 12, topOffset = 80 } = options;
    const hidden = ref(false);

    let lastY = 0;
    let ticking = false;

    const evaluate = (): void => {
        const y = Math.max(0, window.scrollY);

        // Cerca del inicio siempre visible: si no, al abrir una página corta el botón
        // podría quedarse escondido sin que nadie sepa que existe.
        if (y <= topOffset) {
            hidden.value = false;
            lastY = y;
            ticking = false;

            return;
        }

        const delta = y - lastY;

        if (Math.abs(delta) >= threshold) {
            hidden.value = delta > 0;
            lastY = y;
        }

        ticking = false;
    };

    const onScroll = (): void => {
        if (ticking) {
            return;
        }

        ticking = true;
        window.requestAnimationFrame(evaluate);
    };

    onMounted(() => {
        lastY = Math.max(0, window.scrollY);
        window.addEventListener('scroll', onScroll, { passive: true });
    });

    onUnmounted(() => {
        window.removeEventListener('scroll', onScroll);
    });

    return { hidden };
}
