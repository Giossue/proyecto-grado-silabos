export const scrollBehavior = (): ScrollBehavior => {
    if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'none') return 'auto';
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return 'auto';

    return 'smooth';
};
