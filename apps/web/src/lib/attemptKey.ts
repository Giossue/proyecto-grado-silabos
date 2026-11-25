export const attemptKey = () => {
    let current: { signature: string; key: string } | null = null;

    return {
        use: (signature = ''): string => {
            if (current === null || current.signature !== signature) current = { signature, key: crypto.randomUUID() };

            return current.key;
        },
        reset: (): void => {
            current = null;
        },
    };
};
