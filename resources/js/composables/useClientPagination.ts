import { computed, ref, toValue, watch } from 'vue';
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue';
import type { PaginationMeta } from '@/types/pagination';

type ClientPagination<T> = {
    currentPage: Ref<number>;
    items: ComputedRef<T[]>;
    meta: ComputedRef<PaginationMeta>;
    setPage: (page: number) => void;
};

export function useClientPagination<T>(
    source: MaybeRefOrGetter<T[]>,
    requestedPageSize = 10,
): ClientPagination<T> {
    const pageSize = Math.max(1, requestedPageSize);
    const currentPage = ref(1);
    const total = computed(() => toValue(source).length);
    const lastPage = computed(() =>
        Math.max(1, Math.ceil(total.value / pageSize)),
    );

    const setPage = (page: number): void => {
        currentPage.value = Math.min(Math.max(1, page), lastPage.value);
    };

    watch(lastPage, () => setPage(currentPage.value));

    const items = computed(() => {
        const start = (currentPage.value - 1) * pageSize;

        return toValue(source).slice(start, start + pageSize);
    });

    const meta = computed<PaginationMeta>(() => {
        const from =
            total.value === 0 ? null : (currentPage.value - 1) * pageSize + 1;

        return {
            current_page: currentPage.value,
            last_page: lastPage.value,
            per_page: pageSize,
            from,
            to:
                from === null
                    ? null
                    : Math.min(from + pageSize - 1, total.value),
            total: total.value,
        };
    });

    return { currentPage, items, meta, setPage };
}
