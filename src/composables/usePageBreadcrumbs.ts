import { createContext, useContext } from 'react';
import type { BreadcrumbItem } from '@/types';

export type PageTitleState = { title: string; setTitle: (title: string | ((current: string) => string)) => void };

const NO_TITLE: PageTitleState = { title: '', setTitle: () => undefined };

export const BreadcrumbsContext = createContext<BreadcrumbItem[]>([]);
export const PageTitleContext = createContext<PageTitleState>(NO_TITLE);

export function usePageBreadcrumbs(): BreadcrumbItem[] {
    return useContext(BreadcrumbsContext);
}

export function usePageTitle(): PageTitleState {
    return useContext(PageTitleContext);
}
