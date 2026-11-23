import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { registerPageEditor } from './documentPagination';

type Spacer = { pos: number; height: number; tag: 'div' | 'tr' | 'li'; colspan: number };

const key = new PluginKey<DecorationSet>('pageSpacers');

function widget(spacer: Spacer) {
    return Decoration.widget(
        spacer.pos,
        () => {
            const node = document.createElement(spacer.tag);
            node.setAttribute('data-page-spacer', '');
            node.setAttribute('aria-hidden', 'true');
            node.setAttribute('contenteditable', 'false');
            node.className = 'page-break-spacer';
            node.style.cssText = `height:${spacer.height}px;pointer-events:none;overflow-anchor:none;margin:0;padding:0;list-style:none;counter-increment:list-item 0;`;

            if (spacer.tag === 'tr') {
                const cell = document.createElement('td');
                cell.colSpan = spacer.colspan;
                cell.style.cssText = `height:${spacer.height}px;padding:0!important;border:0!important;background:transparent!important;`;
                node.append(cell);
            }

            return node;
        },
        {
            side: -1,
            ignoreSelection: true,
            key: `page-${spacer.pos}-${Math.round(spacer.height)}`,
            stopEvent: () => true,
        },
    );
}

function nodePosition(view: EditorView, element: HTMLElement): number | null {
    let inside: number;

    try {
        inside = view.posAtDOM(element, 0);
    } catch {
        return null;
    }

    const resolved = view.state.doc.resolve(inside);

    for (let depth = resolved.depth; depth >= 1; depth--) {
        const pos = resolved.before(depth);
        const dom = view.nodeDOM(pos);

        if (dom === element) {
            return pos;
        }
    }

    return null;
}

export function pageSpacersPlugin() {
    return new Plugin<DecorationSet>({
        key,
        state: {
            init: () => DecorationSet.empty,
            apply(tr, set) {
                const next = tr.getMeta(key) as Spacer[] | undefined;

                if (next) {
                    return DecorationSet.create(tr.doc, next.map(widget));
                }

                return set.map(tr.mapping, tr.doc);
            },
        },
        props: {
            decorations: (state) => key.getState(state),
        },
        view(view) {
            const host = view.dom as HTMLElement;
            let current: Spacer[] = [];

            const set = (spacers: Spacer[]) => {
                if (view.isDestroyed || view.composing) {
                    return;
                }

                if (spacers.length === 0 && current.length === 0) {
                    return;
                }

                current = spacers;
                view.dispatch(
                    view.state.tr
                        .setMeta(key, spacers)
                        .setMeta('addToHistory', false),
                );
            };

            const unregister = registerPageEditor(host, {
                clear: () => set([]),
                apply: (requests) =>
                    set(
                        requests.flatMap((request) => {
                            const pos = nodePosition(view, request.element);

                            if (pos === null) {
                                return [];
                            }

                            const tag =
                                request.element instanceof HTMLTableRowElement
                                    ? 'tr'
                                    : request.element.tagName === 'LI'
                                      ? 'li'
                                      : 'div';

                            return [
                                {
                                    pos,
                                    height: request.height,
                                    tag,
                                    colspan: request.colspan,
                                } satisfies Spacer,
                            ];
                        }),
                    ),
            });

            return { destroy: unregister };
        },
    });
}
