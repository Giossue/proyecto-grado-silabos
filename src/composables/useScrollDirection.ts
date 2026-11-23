import { useEffect, useState } from 'react';

export type UseScrollDirectionOptions = {
    threshold?: number;
    topOffset?: number;
};

export type UseScrollDirectionReturn = {
    hidden: boolean;
};

export function useScrollDirection(
    options: UseScrollDirectionOptions = {},
): UseScrollDirectionReturn {
    const { threshold = 12, topOffset = 80 } = options;
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let lastY = 0;
        let ticking = false;
        const scroller = document.querySelector<HTMLElement>(
            '[data-app-scroll] > [data-slot="scroll-area-viewport"]',
        );

        const currentY = (): number => Math.max(0, scroller?.scrollTop ?? 0, window.scrollY);

        const evaluate = (): void => {
            const y = currentY();

            if (y <= topOffset) {
                setHidden(false);
                lastY = y;
                ticking = false;

                return;
            }

            const delta = y - lastY;

            if (Math.abs(delta) >= threshold) {
                setHidden(delta > 0);
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

        lastY = currentY();
        scroller?.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            scroller?.removeEventListener('scroll', onScroll);
            window.removeEventListener('scroll', onScroll);
        };
    }, [threshold, topOffset]);

    return { hidden };
}
