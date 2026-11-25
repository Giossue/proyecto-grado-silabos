import { usePathname, useSearchParams } from 'next/navigation';
import { toUrl } from '@/lib/utils';
import type { NavigableHref } from '@/types';

export type UseCurrentUrlReturn = {
    currentUrl: string;
    isCurrentUrl: (urlToCheck: NavigableHref, currentUrl?: string, startsWith?: boolean) => boolean;
    isCurrentOrParentUrl: (urlToCheck: NavigableHref, currentUrl?: string) => boolean;
    whenCurrentUrl: <T, F = null>(urlToCheck: NavigableHref, ifTrue: T, ifFalse?: F) => T | F;
};

export const useCurrentFullPath = (): string => {
    const pathname = usePathname();
    const search = useSearchParams().toString();

    return search ? `${pathname}?${search}` : pathname;
};

export const isUrlCurrent = (urlToCheck: NavigableHref, current: string, startsWith = false): boolean => {
    const raw = toUrl(urlToCheck);
    const target = raw.startsWith('http')
        ? `${new URL(raw).pathname}${new URL(raw).search}`
        : raw;
    const exact = target.includes('?') ? current === target : current.split('?')[0] === target;
    const targetPath = target.split('?')[0];
    const currentPath = current.split('?')[0];

    return exact || (startsWith && currentPath.startsWith(targetPath.endsWith('/') ? targetPath : `${targetPath}/`));
};

export function useCurrentUrl(): UseCurrentUrlReturn {
    const currentUrl = useCurrentFullPath();

    const isCurrentUrl = (urlToCheck: NavigableHref, current = currentUrl, startsWith = false): boolean =>
        isUrlCurrent(urlToCheck, current, startsWith);

    const isCurrentOrParentUrl = (urlToCheck: NavigableHref, current?: string): boolean =>
        isCurrentUrl(urlToCheck, current, true);

    const whenCurrentUrl = <T, F = null>(urlToCheck: NavigableHref, ifTrue: T, ifFalse?: F): T | F =>
        isCurrentUrl(urlToCheck) ? ifTrue : (ifFalse ?? null) as F;

    return { currentUrl, isCurrentUrl, isCurrentOrParentUrl, whenCurrentUrl };
}
