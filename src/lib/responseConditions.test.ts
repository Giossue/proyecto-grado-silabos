import { describe, expect, it } from 'vitest';
import { conditionLabel, conditionSources, evaluateConditions, responseIds, visibleSections, withNewResponseIds, withoutHiddenAnswers, withoutHiddenLines } from '@/lib/responseConditions';
import type { DocumentNode } from '@/lib/templateDocument';

const yesNo = [{ const: 'o1', title: 'Sí' }, { const: 'o2', title: 'No' }];
const ifYes = { response: 'usa_lab', options: ['o1'] };
const source = (value: unknown = null): DocumentNode => ({ type: 'response', attrs: { kind: 'una', options: yesNo, value: value as never, id: 'usa_lab' } });
const target = (value = 'Química'): DocumentNode => ({ type: 'response', attrs: { kind: 'texto', options: [], value, showIf: ifYes } });
const line = (...content: DocumentNode[]): DocumentNode => ({ type: 'doc', content: [{ type: 'paragraph', content }] });

describe('Mostrar solo si', () => {
    it('oculta el campo y la respuesta mientras no se elige la opción, y los muestra al elegirla', () => {
        const fields = (value: unknown) => [
            { key: 'metodologia', document: line({ type: 'text', text: '¿Usa laboratorio? ' }, source(value), target()) },
            { key: 'tecnicas', show_if: ifYes, document: line({ type: 'text', text: 'Técnicas' }) },
        ];

        expect(evaluateConditions(fields('o2')).hidden).toEqual(new Set(['tecnicas']));
        expect(evaluateConditions(fields(null)).hidden).toEqual(new Set(['tecnicas']));
        expect(evaluateConditions(fields('o1')).hidden).toEqual(new Set());
    });

    it('elegir varias cumple si eligió alguna, y lo oculto no decide lo que viene después', () => {
        const many: DocumentNode = { type: 'response', attrs: { kind: 'varias', options: yesNo, value: ['o2', 'o1'], id: 'lugares' } };
        expect(evaluateConditions([{ key: 'a', document: line(many) }, { key: 'b', show_if: { response: 'lugares', options: ['o1'] }, document: null }]).hidden.size).toBe(0);

        const chained: DocumentNode = { type: 'response', attrs: { kind: 'una', options: yesNo, value: 'o1', id: 'segunda', showIf: ifYes } };
        const result = evaluateConditions([
            { key: 'a', document: line(source('o2'), chained) },
            { key: 'b', show_if: { response: 'segunda', options: ['o1'] }, document: null },
        ]);
        expect(result.answers).toEqual({ usa_lab: 'o2', segunda: null });
        expect(result.hidden).toEqual(new Set(['b']));
    });

    it('lo oculto no se imprime en la vista previa del docente', () => {
        const sections = [{ fields: [
            { key: 'metodologia', value: line(source('o2'), target()), document: line(source('o2'), target()) },
            { key: 'tecnicas', show_if: ifYes, value: line(), document: line({ type: 'text', text: 'Técnicas' }) },
        ] }];
        const shown = visibleSections(sections, evaluateConditions(sections.flatMap((section) => section.fields)));

        expect(shown[0]!.fields.map((field) => field.key)).toEqual(['metodologia']);
        expect(JSON.stringify(shown[0]!.fields[0]!.document)).not.toContain('Química');
        expect(withoutHiddenAnswers(line(source('o1'), target()), { usa_lab: 'o1' })).toEqual(line(source('o1'), target()));
    });

    it('lista las respuestas de elegir anteriores con su pregunta y la condición en palabras', () => {
        const sources = conditionSources([
            { id: 'f1', label: 'Métodos', content: line({ type: 'text', text: '¿Usa laboratorio? ' }, source()) },
            { id: 'f2', label: 'Otro', content: line({ type: 'response', attrs: { kind: 'texto', options: [], value: '' } }) },
        ]);

        expect(sources).toEqual([{ id: 'usa_lab', label: 'Usa laboratorio', options: yesNo, field: 'f1', index: 0 }]);
        expect(conditionLabel(ifYes, sources)).toBe('Se muestra solo si «Usa laboratorio» es Sí');
        expect(conditionLabel({ response: 'borrada', options: ['o1'] }, sources)).toBe('Se muestra solo si se cumple una condición que ya no es válida');
    });

    it('al duplicar un campo sus respuestas reciben identificadores nuevos', () => {
        const copy = withNewResponseIds(line(source(), target()), new Set(['usa_lab']));

        expect(responseIds([copy])).toHaveLength(1);
        expect(responseIds([copy])[0]).not.toBe('usa_lab');
        expect(responseIds([copy])[0]).toMatch(/^[a-z][a-z0-9_]{0,40}$/);
    });

    it('si una respuesta queda oculta se quita toda su línea, salvo que la línea tenga otra respuesta que sí se ve', () => {
        const answers = { usa_lab: 'o2' };
        const label = (text: string): DocumentNode => ({ type: 'text', text });
        const document: DocumentNode = { type: 'doc', content: [
            { type: 'paragraph', content: [label('¿Usa laboratorio? '), source('o2')] },
            { type: 'paragraph', content: [label('Cuál: '), target()] },
            { type: 'paragraph', content: [label('Turno: '), source('o2'), label(' Cuál: '), target()] },
            { type: 'paragraph', content: [label('Texto fijo')] },
        ] };

        const shown = withoutHiddenLines(document, answers)!;

        expect(shown.content!.map((node) => (node.content ?? []).map((part) => part.text ?? part.type).join(''))).toEqual(['¿Usa laboratorio? response', 'Turno: response Cuál: response', 'Texto fijo']);
        expect(withoutHiddenLines(document, { usa_lab: 'o1' })).toEqual(document);
        expect(document.content).toHaveLength(4);
    });

    it('en una tabla se vacía la celda de la respuesta oculta y la celda se queda', () => {
        const cell = (...content: DocumentNode[]): DocumentNode => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content }] });
        const table = (second: DocumentNode): DocumentNode => ({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [cell(source('o2')), second] }] }] });
        const hidden = { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cuál:' }] }, { type: 'paragraph', content: [target()] }] } as DocumentNode;

        const shown = withoutHiddenLines(table(hidden), { usa_lab: 'o2' })!;

        expect(shown.content![0]!.content![0]!.content).toEqual([cell(source('o2')), { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph' }] }]);
        expect(withoutHiddenLines(table(hidden), { usa_lab: 'o1' })).toEqual(table(hidden));
    });

    it('la vista previa del docente no deja la etiqueta suelta de una respuesta oculta', () => {
        const document: DocumentNode = { type: 'doc', content: [
            { type: 'paragraph', content: [source('o2')] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Cuál: ' }, target()] },
        ] };
        const sections = [{ fields: [{ key: 'metodologia', value: document, document }] }];

        const shown = visibleSections(sections, evaluateConditions(sections.flatMap((section) => section.fields)));

        expect(JSON.stringify(shown[0]!.fields[0]!.document)).not.toContain('Cuál');
        expect(JSON.stringify(shown[0]!.fields[0]!.value)).not.toContain('Cuál');
        expect(JSON.stringify(sections[0]!.fields[0]!.document)).toContain('Química');
    });

    it('si la respuesta que decide no está en el sílabo (sin identificador o en un campo que ya no existe), lo condicionado se muestra', () => {
        const withoutId: DocumentNode = { type: 'response', attrs: { kind: 'una', options: yesNo, value: 'o1' } };
        const result = evaluateConditions([
            { key: 'metodologia', document: line(withoutId, target()) },
            { key: 'tecnicas', show_if: ifYes, document: line() },
        ]);

        expect(result.hidden.size).toBe(0);
        expect(withoutHiddenAnswers(line(withoutId, target()), result.answers)).toEqual(line(withoutId, target()));
        expect(withoutHiddenLines(line({ type: 'text', text: 'Cuál: ' }, target()), result.answers)).toEqual(line({ type: 'text', text: 'Cuál: ' }, target()));
    });
});
