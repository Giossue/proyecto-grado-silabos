import { signal } from '@/lib/signal';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';
import type { BlockAttrs, BlockDefinition, TemplateDefinitionPayload } from '@silabos/shared/lib/blocks/types';
import { filledText, resolveBlock, toDocument } from '@silabos/shared/lib/blocks/walk';

type Runtime = { definition: TemplateDefinitionPayload | null; variables: Record<string, string> };

const state = signal<Runtime>({ definition: null, variables: {} });

export const setTemplateRuntime = (definition: TemplateDefinitionPayload | null | undefined, variables: Record<string, string> | null | undefined): void => {
    if (definition) state.value = { definition, variables: variables ?? {} };
};

export const templateRuntime = (): Runtime => state.value;

export const blockDefinition = (kind: unknown): BlockDefinition | null =>
    typeof kind === 'string' ? state.value.definition?.blocks[kind] ?? null : null;

export const blockAttrs = (node: DocumentNode): BlockAttrs => {
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {});
    return { kind: typeof attrs.kind === 'string' ? attrs.kind : '', props: record(attrs.props), value: record(attrs.value) };
};

const withVariables = (nodes: DocumentNode[], variables: Record<string, string>): DocumentNode[] => nodes.flatMap((node): DocumentNode[] => {
    if (node.type === 'variable') {
        const text = variables[String(node.attrs?.id ?? '')] ?? '';
        return text === '' ? [] : [{ type: 'text', text, ...(node.marks ? { marks: node.marks } : {}) }];
    }
    return [node.content ? { ...node, content: withVariables(node.content, variables) } : node];
});

export const expandBlock = (node: DocumentNode, variables: Record<string, string> = state.value.variables): DocumentNode[] => {
    const attrs = blockAttrs(node);
    const definition = blockDefinition(attrs.kind);
    if (!definition) return [];
    return withVariables(toDocument(resolveBlock(definition, attrs.props, attrs.value, variables)), variables);
};

export const blockFilledText = (node: DocumentNode): string => {
    const attrs = blockAttrs(node);
    const definition = blockDefinition(attrs.kind);
    return definition ? filledText(resolveBlock(definition, attrs.props, attrs.value, {})) : '';
};
