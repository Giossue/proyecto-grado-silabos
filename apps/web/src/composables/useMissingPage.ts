import { notFound } from 'next/navigation';
import { createContext, useContext, useLayoutEffect } from 'react';

export const MissingPageContext = createContext<(() => void) | null>(null);

export function useMissingPage(missing: boolean): void {
    const showOnWholeScreen = useContext(MissingPageContext);
    useLayoutEffect(() => {
        if (missing) showOnWholeScreen?.();
    }, [missing, showOnWholeScreen]);
    if (missing && showOnWholeScreen === null) notFound();
}
