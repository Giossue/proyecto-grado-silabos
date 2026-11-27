import { emptyValue } from './blocks/values';
import { isChoice, optionTitle, type ChoiceSchema, type ValueSchema } from './blocks/types';
import type { DocumentNode } from './templateDocument';

export const RESPONSE_NODE = 'response';
export const FREE_TEXT_KIND = 'texto';
export const FREE_TEXT_LABEL = 'Texto libre';
export const RESPONSE_MAX_OPTIONS = 50;
export const RESPONSE_OPTION_LENGTH = 120;

export const RESPONSE_HELP_LENGTH = 200;

export type ResponseOption = { const: string; title: string };
export type ResponseDisplay = 'lista' | 'desplegable';
export type ResponseSettings = { required?: boolean; help?: string; maxLength?: number; minChoices?: number; maxChoices?: number; display?: ResponseDisplay };
export type ResponseSettingName = keyof ResponseSettings;
export type ResponseLogic = { id?: string; showIf?: { response: string; options: string[] } };
export type ResponseAttrs = { kind: string; options: ResponseOption[]; value: unknown } & ResponseSettings & ResponseLogic;

export const RESPONSE_DISPLAYS: Array<{ value: ResponseDisplay; label: string }> = [{ value: 'lista', label: 'Lista' }, { value: 'desplegable', label: 'Desplegable' }];

const choice: ChoiceSchema = { type: 'string', oneOf: [] };

export const RESPONSE_TEXT_LENGTH = 3000;

export const RESPONSE_KINDS: Record<string, { label: string; schema: ValueSchema; settings: ResponseSettingName[] }> = {
    texto: { label: FREE_TEXT_LABEL, schema: { type: 'string', maxLength: RESPONSE_TEXT_LENGTH, multiline: true }, settings: ['maxLength'] },
    una: { label: 'Elegir una', schema: choice, settings: ['display'] },
    varias: { label: 'Elegir varias', schema: { type: 'array', minItems: 0, maxItems: 100, initial: 0, items: choice }, settings: ['minChoices', 'maxChoices'] },
};

export const RESPONSE_SETTING_DEFAULTS: { [name in ResponseSettingName]-?: ResponseSettings[name] | null } = {
    required: true, help: '', maxLength: RESPONSE_TEXT_LENGTH, minChoices: null, maxChoices: null, display: 'lista',
};

export const RESPONSE_COMMON_SETTINGS: ResponseSettingName[] = ['required', 'help'];

export const responseSettingNames = (kind: string): ResponseSettingName[] => [...RESPONSE_COMMON_SETTINGS, ...(RESPONSE_KINDS[kind]?.settings ?? [])];

const validSetting = (name: ResponseSettingName, value: unknown): boolean => {
    if (name === 'required') return typeof value === 'boolean';
    if (name === 'help') return typeof value === 'string';
    if (name === 'display') return RESPONSE_DISPLAYS.some((display) => display.value === value);
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
};

export const responseSettings = (kind: string, raw: Record<string, unknown>): ResponseSettings => {
    const settings: Record<string, unknown> = {};
    for (const name of responseSettingNames(kind)) {
        const value = name === 'help' && typeof raw[name] === 'string' ? (raw[name] as string).replace(/\s+/g, ' ').trim() : raw[name];
        if (value !== null && value !== undefined && validSetting(name, value) && value !== RESPONSE_SETTING_DEFAULTS[name]) settings[name] = value;
    }
    return settings as ResponseSettings;
};

export const responseSetting = <K extends ResponseSettingName>(attrs: ResponseSettings, name: K): ResponseSettings[K] | null =>
    attrs[name] ?? (RESPONSE_SETTING_DEFAULTS[name] as ResponseSettings[K] | null);

export const responseRequired = (attrs: ResponseSettings): boolean => attrs.required !== false;

export const responseKindOptions = Object.entries(RESPONSE_KINDS).map(([kind, entry]) => ({ kind, label: entry.label }));

const kindSchema = (kind: string): ValueSchema | null => RESPONSE_KINDS[kind]?.schema ?? null;

export const responseHasOptions = (kind: string): boolean => {
    const schema = kindSchema(kind);
    return isChoice(schema) || (schema?.type === 'array' && isChoice(schema.items));
};

export const responseMany = (kind: string): boolean => kindSchema(kind)?.type === 'array';

export const responseSchema = (kind: string, options: ResponseOption[], settings: ResponseSettings = {}): ValueSchema | null => {
    const schema = kindSchema(kind);
    if (!schema) return null;
    if (isChoice(schema)) return { ...schema, oneOf: options };
    if (schema.type === 'array' && isChoice(schema.items)) return { ...schema, maxItems: settings.maxChoices ?? schema.maxItems, items: { ...schema.items, oneOf: options } };
    if (schema.type === 'string' && settings.maxLength) return { ...schema, maxLength: settings.maxLength };
    return schema;
};

const emptyOf = (kind: string): unknown => {
    const schema = kindSchema(kind);
    return schema ? emptyValue(schema, {}) : null;
};

const logicOf = (raw: Record<string, unknown>): ResponseLogic => {
    const logic: ResponseLogic = {};
    if (typeof raw.id === 'string' && raw.id) logic.id = raw.id;
    const showIf = raw.showIf as ResponseLogic['showIf'] | undefined;
    if (showIf && typeof showIf.response === 'string' && Array.isArray(showIf.options)) logic.showIf = { response: showIf.response, options: [...showIf.options] };
    return logic;
};

export const emptyResponse = (kind: string, options: ResponseOption[] = [], settings: ResponseSettings = {}, logic: ResponseLogic = {}): DocumentNode => ({
    type: RESPONSE_NODE,
    attrs: { kind, options: responseHasOptions(kind) ? options : [], value: emptyOf(kind) as never, ...responseSettings(kind, settings), ...logicOf(logic) },
});

export const responseAttrs = (node: DocumentNode | null | undefined): ResponseAttrs => {
    const attrs = (node?.attrs ?? {}) as Record<string, unknown>;
    const kind = typeof attrs.kind === 'string' ? attrs.kind : '';
    const options = Array.isArray(attrs.options)
        ? (attrs.options as unknown[]).filter((option): option is ResponseOption => typeof option === 'object' && option !== null
            && typeof (option as ResponseOption).const === 'string' && typeof (option as ResponseOption).title === 'string')
        : [];
    return { kind, options, value: attrs.value === undefined ? emptyOf(kind) : attrs.value, ...responseSettings(kind, attrs), ...logicOf(attrs) };
};

export const responseAnswered = (attrs: ResponseAttrs): boolean =>
    Array.isArray(attrs.value) ? attrs.value.length > 0 : attrs.value !== null && attrs.value !== undefined && attrs.value !== '';

export const responseNeedsOptions = (attrs: ResponseAttrs): boolean => responseHasOptions(attrs.kind) && attrs.options.length === 0;

export const responseAdjustable = (attrs: ResponseAttrs): boolean => responseHasOptions(attrs.kind) && attrs.options.length > 0;

export const sameResponseOptions = (first: ResponseOption[], second: ResponseOption[]): boolean =>
    first.length === second.length && first.every((option, index) => option.const === second[index]!.const && option.title === second[index]!.title);

export const keptAnswer = (value: unknown, options: ResponseOption[]): unknown => {
    const keys = options.map((option) => option.const);
    if (Array.isArray(value)) return value.filter((chosen) => keys.includes(chosen as string));
    return typeof value === 'string' && keys.includes(value) ? value : null;
};

export const responseLines = (attrs: ResponseAttrs): string[] => {
    if (!responseAnswered(attrs)) return [];
    if (!responseHasOptions(attrs.kind)) return [String(attrs.value)];
    const schema: ChoiceSchema = { type: 'string', oneOf: attrs.options };
    return (Array.isArray(attrs.value) ? attrs.value : [attrs.value]).map((chosen) => optionTitle(schema, chosen)).filter(Boolean);
};

export const responseLabel = (attrs: ResponseAttrs): string => {
    const label = `${RESPONSE_KINDS[attrs.kind]?.label ?? 'Respuesta'}${responseRequired(attrs) ? '' : ' (opcional)'}`;
    if (!responseHasOptions(attrs.kind)) return label;
    return `${label}: ${attrs.options.length ? attrs.options.map((option) => option.title).join(' · ') : 'sin opciones'}`;
};

export const nextOptionKey = (options: ResponseOption[]): string => {
    let index = options.length + 1;
    while (options.some((option) => option.const === `o${index}`)) index++;
    return `o${index}`;
};

export const withinResponse = (node: DocumentNode | null | undefined): boolean =>
    Boolean(node) && (node!.type === RESPONSE_NODE || (node!.content ?? []).some(withinResponse));

/** What someone typed in a value; blank text and empty rows count as nothing. */
const typedIn = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return Object.values(value).map(typedIn).join('');
    return String(value).replace(/\s+/g, '');
};

const writtenIn = (node: DocumentNode): string => {
    if (node.type === 'text') return typedIn(node.text);
    if (node.type === 'documentBlock') return typedIn(node.attrs?.value);
    return (node.content ?? []).map(writtenIn).join('');
};

export const TEMPLATE_ACCEPTED = 'accepted';

export const TEACHER_EDITS = 'teacherEdits';

export const OWN_TEXT = 'ownText';

export const TEACHER_FILLS = 'teacherFills';

export const teacherFillsMarked = (document: DocumentNode | null | undefined): boolean =>
    (document?.attrs as Record<string, unknown> | undefined)?.[TEACHER_FILLS] === true;

const emptyCell = (node: DocumentNode): boolean =>
    (node.type === 'tableCell' && (node.content ?? []).every((child) => child.type === 'paragraph' && !child.content?.length))
    || (node.content ?? []).some(emptyCell);

export const teacherEditsAllowed = (document: DocumentNode | null | undefined): boolean =>
    (document?.attrs as Record<string, unknown> | undefined)?.[TEACHER_EDITS] === true;

export const templateAccepted = (document: DocumentNode | null | undefined): boolean =>
    (document?.attrs as Record<string, unknown> | undefined)?.[TEMPLATE_ACCEPTED] === true;

export const teacherFillsAllowed = (template: DocumentNode, document: DocumentNode): boolean =>
    !withinResponse(document) && emptyCell(document) && writtenIn(document) === writtenIn(template);

/** A subject's Carrera field nobody has decided about: not accepted as is, no type of answer in it and no text beyond the template's. */
export const careerFieldUndecided = (template: DocumentNode, document: DocumentNode): boolean =>
    !templateAccepted(document) && !teacherEditsAllowed(document) && !(teacherFillsMarked(document) && teacherFillsAllowed(template, document))
    && !withinResponse(document) && writtenIn(document) === writtenIn(template);
