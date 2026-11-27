import type { LucideIcon } from 'lucide-react';

export type NavigableHref = string | { url: string };

export type BreadcrumbItem = {
    title: string;
    href?: NavigableHref;
};

export type NavItem = {
    title: string;
    href: NavigableHref;
    icon?: LucideIcon;
    isActive?: boolean;
    /** Other address prefixes that belong to this entry. */
    activeUrls?: string[];
    badge?: number;
    items?: NavItem[];
};
