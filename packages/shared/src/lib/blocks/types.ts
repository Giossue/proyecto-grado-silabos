import type { DocumentNode } from '../templateDocument';

export type Condition =
    | { not: Condition }
    | ({ value?: string; prop?: string; item?: string; variable?: string } & ({ equals: string | number | null } | { empty: boolean } | { zero: boolean }));

type SchemaBase = { title?: string; errorMessage?: string; keep_if?: Condition };
export type TextSchema = SchemaBase & { type: 'string'; maxLength: number; minLength?: number; multiline: boolean; oneOf?: undefined };
export type ChoiceSchema = SchemaBase & { type: 'string'; oneOf: Array<{ const: string; title: string }> };
export type NumberSchema = SchemaBase & { type: 'number'; maximum: number; multipleOf: number };
export type ObjectSchema = SchemaBase & { type: 'object'; properties: Record<string, ValueSchema> };
export type ListSchema = SchemaBase & { type: 'array'; minItems: number; maxItems: number; initial: number; items: ValueSchema };
export type ValueSchema = TextSchema | NumberSchema | ChoiceSchema | ObjectSchema | ListSchema;
export type PropSchema = TextSchema;

export const isChoice = (schema: ValueSchema | null | undefined): schema is ChoiceSchema => schema?.type === 'string' && Array.isArray(schema.oneOf);
export const isText = (schema: ValueSchema | null | undefined): schema is TextSchema => schema?.type === 'string' && !Array.isArray(schema.oneOf);
export const plural = (word: string): string => (/[aeiouáéíóú]$/i.test(word) ? `${word}s` : `${word}es`).toLowerCase();
export const optionTitle = (schema: ChoiceSchema, value: unknown): string => schema.oneOf.find((option) => option.const === value)?.title ?? '';
export const numberDigits = (schema: NumberSchema): { digits: number; decimals: number } => ({
    digits: String(Math.floor(schema.maximum)).length,
    decimals: schema.multipleOf >= 1 ? 0 : Math.round(-Math.log10(schema.multipleOf)),
});
export const numberText = (raw: string, schema: NumberSchema): string => {
    const { digits, decimals } = numberDigits(schema);
    const cleaned = raw.replace(/[^\d.,]/g, '');
    const separator = cleaned.search(/[.,]/);
    const whole = (separator < 0 ? cleaned : cleaned.slice(0, separator)).slice(0, digits);
    if (separator < 0 || decimals === 0) return whole;
    return `${whole}${cleaned[separator]}${cleaned.slice(separator + 1).replace(/[.,]/g, '').slice(0, decimals)}`;
};
export const guardNumber = (event: InputEvent, schema: NumberSchema): void => {
    const input = event.target as HTMLInputElement;
    const data = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (data === '') return;
    const start = input.selectionStart ?? input.value.length;
    const next = input.value.slice(0, start) + data + input.value.slice(input.selectionEnd ?? start);
    if (numberText(next, schema) !== next) event.preventDefault();
};

export type RuleTarget = number | { variable: string } | { count: string };
export type RuleCheck = { label?: string; count?: string; filled?: string; sum?: string; equals?: RuleTarget; max?: RuleTarget; min?: RuleTarget };
export type BlockRule = { code: string; on: 'save' | 'submit'; message: string; hint?: string; checks: RuleCheck[] };

export type BlockDefinition = {
    label: string;
    props: Record<string, PropSchema>;
    value: Record<string, ValueSchema>;
    rules: BlockRule[];
    layout: DocumentNode[];
    catalog?: { list: string; map: Record<string, string> };
};

export type DocumentStyle = {
    paper: 'letter' | 'a4' | 'legal';
    orientation: 'portrait' | 'landscape';
    margin_cm: number;
    font_family: string;
    line_height: number;
    paragraph_spacing_pt: number;
    sizes: { title: number; section: number; body: number };
    colors: { text: string; title: string; table_header_background: string | null; table_header_text: string | null; table_border: string; empty_text: string };
    title: { text: string; bold: boolean; italic: boolean; alignment: string };
    section_title: { bold: boolean; italic: boolean; alignment: string };
    body: { alignment: string };
    header: { logos: Array<{ source: 'institution' | 'faculty'; height_pt: number }>; left_share: number };
    empty_text: string;
    choices: { margin_cm: number[]; title: number[]; section: number[]; body: number[] };
};

export type TemplateDefinitionPayload = { response_policy?: 'protected'; document: DocumentStyle; blocks: Record<string, BlockDefinition> };

export type BlockAttrs = { kind: string; props: Record<string, unknown>; value: Record<string, unknown> };
