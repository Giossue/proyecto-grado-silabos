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
    badge?: number;
    items?: NavItem[];
};
