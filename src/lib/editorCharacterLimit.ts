import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { characters, fitCharacters } from './fieldLimits';

const key = new PluginKey('characterLimit');

export const documentCharacters = (node: ProseMirrorNode, from = 0, to = node.content.size): number => {
    let count = 0;
    node.nodesBetween(from, to, (child, position) => {
        if (child.type.name === 'documentBlock' || child.type.name === 'response') return false;
        if (child.isText) {
            const start = Math.max(from, position) - position;
            const end = Math.min(to, position + child.nodeSize) - position;
            count += characters((child.text ?? '').slice(start, end));
        }
        return true;
    });
    return count;
};

export const characterLimitPlugin = (limit: () => number | null | undefined): Plugin => new Plugin({
    key,
    filterTransaction(transaction, state) {
        const max = limit();
        if (!max || !transaction.docChanged || transaction.getMeta('preventUpdate') === true) return true;
        const next = documentCharacters(transaction.doc);
        return next <= max || next <= documentCharacters(state.doc);
    },
    props: {
        handlePaste(view, _event, slice) {
            const max = limit();
            if (!max) return false;
            const { state } = view;
            const { from, to } = state.selection;
            const remaining = max - documentCharacters(state.doc) + documentCharacters(state.doc, from, to);
            const text = slice.content.textBetween(0, slice.content.size, ' ', ' ');
            if (characters(text) <= remaining) return false;
            if (remaining > 0) view.dispatch(state.tr.insertText(fitCharacters(text, remaining), from, to));
            return true;
        },
    },
});
