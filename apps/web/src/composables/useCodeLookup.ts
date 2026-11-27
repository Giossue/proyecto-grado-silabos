import { useState } from 'react';
import { useMissingPage } from '@/composables/useMissingPage';

type LookupSource<TData> = { data: TData | undefined; isFetching: boolean; isError: boolean };

/**
 * Turns the code written in a page address into the record it names, using a list the role can already read.
 * `null` while the list is loading or failed. A code missing from an up-to-date list is a 404.
 * Once found it stays for that address, so a later refresh never takes away an open screen and its unsaved changes.
 */
/** Codes are unique whatever their case, so an address matches them ignoring it. */
export const sameCode = (code: string | null | undefined, written: string): boolean => code?.toLowerCase() === written.toLowerCase();

export function useCodeLookup<TData, TFound>(
    address: string,
    source: LookupSource<TData>,
    find: (data: NonNullable<TData>) => TFound | undefined,
): TFound | null {
    const [kept, setKept] = useState<{ address: string; found: TFound } | null>(null);
    const saved = kept?.address === address ? kept : null;
    const data = saved ? undefined : (source.data ?? undefined);
    const found = data === undefined ? undefined : find(data as NonNullable<TData>);
    if (found !== undefined) setKept({ address, found });
    useMissingPage(data !== undefined && found === undefined && !source.isFetching && !source.isError);

    return saved ? saved.found : (found ?? null);
}
