export type PaginationLink = {
    url: string | null;
    label: string;
    active: boolean;
};

export type PaginationMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
    links?: PaginationLink[];
};

export type Paginated<T> = PaginationMeta & {
    data: T[];
    prev_page_url: string | null;
    next_page_url: string | null;
};
