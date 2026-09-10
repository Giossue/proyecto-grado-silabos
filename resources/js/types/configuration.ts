import type { TableLayout } from '@/lib/tableLayout';
import type {
    DocumentField,
    DocumentNode,
    TemplateVariable,
} from '@/lib/templateDocument';

export type TemplateContentType =
    | 'text'
    | 'table'
    | 'bulleted_list'
    | 'numbered_list'
    | 'institutional'
    | 'flow';

export type TemplateField = DocumentField & {
    id: string;
    block_id: string;
    help: string | null;
    content_type: TemplateContentType;
    page_orientation?: 'portrait' | 'landscape' | null;
    master_source: string | null;
    ai_enabled: boolean;
    document_marker: string | null;
};

export type TemplateFieldContainer = {
    id: string;
    key: string;
    title: string;
    type: string;
    content_type: TemplateContentType;
    table: TableLayout | null;
    document?: DocumentNode | null;
    fingerprint?: string;
    fields: TemplateField[];
};

export type TemplateSection = {
    id: string;
    key: string;
    title: string;
    description: string | null;
    blocks: TemplateFieldContainer[];
};

export type TemplateAppearance = {
    font_family: string;
    body_font_size: number;
    title_font_size: number;
    section_font_size: number;
    field_font_size: number;
    text_color: string;
    accent_color: string;
    table_header_background: string;
    table_header_color: string;
    margin_cm: number;
    orientation: 'portrait' | 'landscape';
    title_bold: boolean;
    title_italic: boolean;
    title_alignment: 'left' | 'center' | 'right' | 'justify';
    section_bold: boolean;
    section_italic: boolean;
    section_alignment: 'left' | 'center' | 'right' | 'justify';
    body_alignment: 'left' | 'center' | 'right' | 'justify';
};

type Option<T extends string | number = string> = {
    value: T;
    label: string;
};

export type TemplateAppearanceOptions = {
    fonts: Option[];
    body_sizes: Option<number>[];
    title_sizes: Option<number>[];
    section_sizes: Option<number>[];
    field_sizes: Option<number>[];
    margins: Option<number>[];
    colors: Option[];
    alignments: Option<TemplateAppearance['title_alignment']>[];
    orientations: Option<TemplateAppearance['orientation']>[];
};

export type TemplateBuilderProps = {
    processLock: string | null;
    identificationSample: unknown[][];
    variables: TemplateVariable[];
    identificationDesign: DocumentNode;
    logos: {
        institution: string;
        faculty: string;
        institution_size: { width: number; height: number };
        faculty_size: { width: number; height: number };
    };
    template: {
        id: string;
        name: string;
        description: string | null;
        appearance: TemplateAppearance;
        titleBlock: { text: string };
        sections: TemplateSection[];
    };
    blockTypes: {
        value: Exclude<TemplateContentType, 'institutional' | 'flow'>;
        label: string;
    }[];
    appearanceOptions: TemplateAppearanceOptions;
};
