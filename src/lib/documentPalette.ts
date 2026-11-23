export const DOCUMENT_COLORS = Object.freeze({
    text: '#000000',
    paper: '#FFFFFF',
    border: '#7F7F7F',
    tableBorder: '#000000',
    mutedText: '#595959',
    institutionalBlue: '#0070C0',
    darkBlue: '#1F4E78',
    red: '#C00000',
    green: '#548235',
    lightBlue: '#DBE5F1',
    headerBlue: '#C3D4EA',
    tableHeader: '#4F81BD',
    tableHeaderText: '#365F91',
    total: '#B8CCE4',
    lightGray: '#E7E6E6',
    fieldBackground: '#EDF6FF',
    variableBackground: '#EDF8EE',
} as const);

export const initializeDocumentPalette = (): void => {
    const properties = {
        '--document-paper': DOCUMENT_COLORS.paper,
        '--document-text': DOCUMENT_COLORS.text,
        '--document-border': DOCUMENT_COLORS.border,
        '--document-table-border': DOCUMENT_COLORS.tableBorder,
        '--document-table-header-background': DOCUMENT_COLORS.lightBlue,
        '--document-table-header-color': DOCUMENT_COLORS.tableHeaderText,
        '--document-table-header-strong-background': DOCUMENT_COLORS.tableHeader,
        '--document-table-total-background': DOCUMENT_COLORS.total,
        '--document-muted-text': DOCUMENT_COLORS.mutedText,
        '--document-accent': DOCUMENT_COLORS.institutionalBlue,
    };
    Object.entries(properties).forEach(([property, value]) => document.documentElement.style.setProperty(property, value));
};

export const DOCUMENT_CELL_COLORS = [
    { label: 'Sin fondo', value: null, text: null, bold: null },
    { label: 'Celeste', value: DOCUMENT_COLORS.headerBlue, text: null, bold: true },
    { label: 'Azul institucional', value: DOCUMENT_COLORS.tableHeader, text: DOCUMENT_COLORS.paper, bold: true },
] as const;

export const DOCUMENT_TEXT_COLORS = [
    { label: 'Negro', value: DOCUMENT_COLORS.text },
    { label: 'Azul', value: DOCUMENT_COLORS.tableHeaderText },
    { label: 'Blanco', value: DOCUMENT_COLORS.paper },
] as const;

export type DocumentCellColor = (typeof DOCUMENT_CELL_COLORS)[number];

export const paintCell = <T extends { setCellAttribute: (name: string, value: unknown) => T }>(chain: T, color: DocumentCellColor): T =>
    chain.setCellAttribute('backgroundColor', color.value).setCellAttribute('textColor', color.text).setCellAttribute('bold', color.bold);
