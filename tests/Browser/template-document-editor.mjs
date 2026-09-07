import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { createServer } from 'vite';

const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = `
import { createApp, h, ref } from 'vue';
import Editor from '/resources/js/components/domain/configuration/TemplateDocumentEditor.vue';
import View from '/resources/js/components/domain/configuration/TemplateDocumentView.vue';
import DesignBlock from '/resources/js/components/domain/configuration/TemplateDesignBlock.vue';
import { router } from '@inertiajs/vue3';
import { usePurgeConfirmation } from '/resources/js/composables/usePurgeConfirmation.ts';
import { cellNode, paragraph, textNode, fieldNode } from '/resources/js/lib/templateDocument.ts';
import '/resources/css/app.css';
const component = ref(null);
const design = ref(null);
const designEditing = ref(false);
const saved = ref(null);
const values = ref([{ id: 'field-test', key: 'objetivo', label: 'Objetivo', type: 'texto_largo', value: '', rows: [], teacher_editable: true, required: true }]);
const doc = { type: 'doc', content: [paragraph([textNode('Texto de prueba')]), {type:'table', content: [
 {type:'tableRow', content:[cellNode([textNode('A')]),cellNode([textNode('B')]),cellNode([textNode('C')])]},
 {type:'tableRow', content:[cellNode([fieldNode(values.value[0])]),cellNode([textNode('E')]),cellNode([textNode('F')])]},
 {type:'tableRow', content:[cellNode([textNode('G')]),cellNode([textNode('H')]),cellNode([textNode('I')])]},
]}, paragraph()]};
window.fixture = { api: () => component.value.editor, save: () => component.value.save(), openDesign: () => designEditing.value = true, closeDesign: () => designEditing.value = false, saveDesign: () => design.value.save(), openProperties: () => design.value.openProperties(), saved: () => saved.value, value: () => values.value[0].value, values: () => values.value, registerFields: fields => values.value = [...values.value, ...fields] };
const block = ref({ id: 'synthetic-block', title: 'Objetivo', content_type: 'text', table: null, fields: values.value, document: doc, fingerprint: 'a'.repeat(64) });
const requests = [];
let failure = null;
const globalPurge = usePurgeConfirmation();
Object.assign(window.fixture, { requests, fail: value => failure = value, globalPurgeOpen: () => globalPurge.open.value });
router.patch = async (url, data, options) => {
 const visit = { url: new URL(url, window.location.origin), method: 'patch', data };
 const event = new CustomEvent('inertia:before', {cancelable: true, detail: {visit}});
 if (!document.dispatchEvent(event)) return;
 requests.push(JSON.parse(JSON.stringify(data)));
 options.onStart?.(visit);
 if (failure) {
  const errors = failure; failure = null;
  options.onError?.(errors);
  document.dispatchEvent(new CustomEvent('inertia:error', {detail: {errors}}));
 } else {
  block.value = {...block.value, title: data.title, fields: block.value.fields.map(field => ({...field, ...data.properties.find(property => property.key === field.key)})), document: JSON.parse(JSON.stringify(data.document)), fingerprint: 'b'.repeat(64)};
  await options.onSuccess?.({});
 }
 options.onFinish?.(visit);
};
createApp({render: () => h('div', {}, [
 h('section', {style:'height:850px;display:flex;flex-direction:column', 'aria-label':'Administrador'}, [h(Editor, {ref:component, document:doc, variables:[{key:'nombre_carrera',label:'Nombre de la carrera',sample:'Software'}], pending:false, onSave: value => saved.value = JSON.parse(JSON.stringify(value))})]),
 saved.value ? h('section', {'aria-label':'Docente'}, [h(View, {document:saved.value,fields:values.value,variables:{nombre_carrera:'Software real'},editable:true, onValue: (key,value) => values.value = values.value.map(f => f.key === key ? {...f,value} : f)})]) : null,
 h(DesignBlock, { ref:design, templateId:'synthetic-template', block:block.value, identification:doc, variables:[{key:'nombre_carrera',label:'Nombre de la carrera',sample:'Software'}], readonly:false, editing:designEditing.value }),
])}).mount('#app');
`;

test(
    'admin formats and merges freely; mentions persist and teacher only fills fields',
    { timeout: 60000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-template-document-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/domain/configuration/TemplateDocumentEditor.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'template-document-fixture',
                    resolveId: (id) =>
                        id === 'virtual:template-document-fixture'
                            ? id
                            : undefined,
                    load: (id) =>
                        id === 'virtual:template-document-fixture'
                            ? fixture
                            : undefined,
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><main id="app" style="padding:16px"></main><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:template-document-fixture"></script></body></html>',
                                );
                            },
                        );
                    },
                },
            ],
            server: { host: '127.0.0.1', port: 0 },
        });
        context.after(() => server.close());
        await server.listen();
        const browser = await chromium.launch({
            headless: true,
            ...(process.env.CHROMIUM_PATH
                ? { executablePath: process.env.CHROMIUM_PATH }
                : {}),
        });
        context.after(() => browser.close());
        const page = await browser.newPage({
            viewport: { width: 1280, height: 1000 },
        });
        const errors = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
            context.diagnostic(error.message);
        });
        await page.goto(`${server.resolvedUrls.local[0]}fixture`);
        await page.waitForSelector('.tiptap');
        const editorSurface = page
            .getByRole('region', { name: 'Administrador' })
            .locator('.tiptap');
        const openMenu = async (target) =>
            target.click({ button: 'right', position: { x: 8, y: 8 } });
        const chooseItem = async (target, name) => {
            await openMenu(target);
            await page.getByRole('menuitem', { name, exact: true }).click();
        };
        const chooseSubItem = async (target, submenu, name) => {
            await openMenu(target);
            await page
                .getByRole('menuitem', { name: submenu, exact: true })
                .hover();
            await page.getByRole('menuitem', { name, exact: true }).click();
        };
        await page.evaluate(() =>
            window.fixture.api().commands.setTextSelection({ from: 1, to: 16 }),
        );
        const formattedParagraph = editorSurface.locator('> p').first();
        await chooseItem(formattedParagraph, 'Negrita');
        await chooseItem(formattedParagraph, 'Cursiva');
        await chooseSubItem(
            formattedParagraph,
            'Alineación del texto',
            'Derecha',
        );
        await chooseSubItem(
            formattedParagraph,
            'Tipo de fuente',
            'Times New Roman',
        );
        await chooseSubItem(formattedParagraph, 'Tamaño de fuente', '14 pt');
        await chooseSubItem(formattedParagraph, 'Color de fuente', 'Rojo');
        await page.locator('.tiptap > p').last().click();
        await page.waitForFunction(() => window.fixture.api().view.hasFocus());
        await page.keyboard.type('@nombre_carr');
        await page
            .getByRole('option', {
                name: '@nombre_carrera — Nombre de la carrera',
                exact: true,
            })
            .waitFor();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page
            .locator('.tiptap [data-variable="nombre_carrera"]')
            .waitFor();
        assert.equal(
            await page
                .locator('.tiptap [data-variable="nombre_carrera"]')
                .count(),
            1,
        );

        const selectCells = async (first, last) =>
            page.evaluate(
                ([first, last]) => {
                    const editor = window.fixture.api();
                    const cells = [];
                    editor.state.doc.descendants((node, pos) => {
                        if (node.type.name === 'tableCell') {
                            cells.push(pos);
                        }
                    });
                    editor.commands.setCellSelection({
                        anchorCell: cells[first],
                        headCell: cells[last],
                    });
                },
                [first, last],
            );
        await selectCells(0, 1);
        await chooseItem(editorSurface.locator('td').first(), 'Unir celdas');
        assert.equal(
            await page.locator('.tiptap td').first().getAttribute('colspan'),
            '2',
        );
        assert.match(
            await page.locator('.tiptap td').first().innerText(),
            /A[\s\S]*B/,
        );
        await selectCells(0, 0);
        await chooseItem(editorSurface.locator('td').first(), 'Dividir celda');
        assert.equal(await page.locator('.tiptap td').count(), 9);
        await selectCells(0, 3);
        await chooseItem(editorSurface.locator('td').first(), 'Unir celdas');
        assert.equal(
            await page.locator('.tiptap td').first().getAttribute('rowspan'),
            '2',
        );
        await page.evaluate(() => window.fixture.save());
        const saved = await page.evaluate(() => window.fixture.saved());
        const first = saved.content[0];
        assert.equal(first.attrs.textAlign, 'right');
        assert.ok(first.content[0].marks.some((mark) => mark.type === 'bold'));
        assert.ok(
            first.content[0].marks.some((mark) => mark.type === 'italic'),
        );
        const style = first.content[0].marks.find(
            (mark) => mark.type === 'textStyle',
        ).attrs;
        assert.equal(style.fontFamily, 'Times New Roman');
        assert.equal(style.fontSize, '14pt');
        assert.equal(style.color, '#C00000');
        await page.evaluate(() =>
            window.fixture.api().commands.setContent(window.fixture.saved()),
        );
        assert.equal(
            await page
                .locator('.tiptap [data-variable="nombre_carrera"]')
                .count(),
            1,
        );
        const teacher = page.getByRole('region', { name: 'Docente' });
        await teacher
            .getByRole('textbox', { name: 'Objetivo', exact: true })
            .fill('Contenido que escribe el docente');
        assert.equal(
            await page.evaluate(() => window.fixture.value()),
            'Contenido que escribe el docente',
        );
        assert.equal(
            await teacher.locator('[contenteditable="true"]').count(),
            0,
        );
        assert.equal(
            await teacher
                .locator('[data-variable="nombre_carrera"]')
                .innerText(),
            'Software real',
        );
        assert.equal(
            await teacher
                .getByRole('button', { name: 'Combinar celdas' })
                .count(),
            0,
        );
        assert.deepEqual(errors, []);

        // Clipboard HTML must preserve the automatic token, not turn it into literal @text.
        await page.evaluate(() => {
            const editor = window.fixture.api();
            editor.commands.setContent(editor.getHTML());
        });
        await page
            .locator('.tiptap [data-variable="nombre_carrera"]')
            .waitFor();

        // @docente creates independent inputs, in paragraphs and complex table cells.
        await page.locator('.tiptap > p').last().click();
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        await page.keyboard.type('@docente');
        await page
            .getByRole('option', {
                name: '@docente — Campo que completará el docente',
                exact: true,
            })
            .click();
        await chooseSubItem(
            editorSurface.locator('[data-template-field]').last(),
            'Tipo de contenido',
            'Lista con viñetas',
        );
        await page.locator('.tiptap td').last().click();
        // Native selection is observed asynchronously by ProseMirror after focus.
        // Wait for the caret in the cell before typing, without moving it through the API.
        await page.waitForFunction(() => {
            const selection = window.fixture.api().state.selection;

            return (
                selection.empty &&
                Array.from(
                    { length: selection.$from.depth },
                    (_, index) => selection.$from.node(index + 1).type.name,
                ).includes('tableCell')
            );
        });
        await page.keyboard.press('End');
        await page.keyboard.type(' @docente');
        await page
            .getByRole('option', {
                name: '@docente — Campo que completará el docente',
                exact: true,
            })
            .click();
        await page.evaluate(() => window.fixture.save());
        const created = await page.evaluate(() => {
            const fields = [];
            const walk = (node) => {
                if (node.type === 'field' && node.attrs.key !== 'objetivo') {
                    fields.push(node.attrs);
                }

                (node.content ?? []).forEach(walk);
            };
            walk(window.fixture.saved());
            window.fixture.registerFields(
                fields.map((attrs) => ({
                    key: attrs.key,
                    label: attrs.label,
                    type: attrs.kind,
                    value: '',
                    teacher_editable: true,
                })),
            );

            return fields;
        });
        assert.equal(created.length, 2, JSON.stringify(created));
        assert.equal(new Set(created.map((field) => field.key)).size, 2);
        assert.equal(
            created.find((field) => field.listStyle === 'bullet').listStyle,
            'bullet',
        );
        assert.ok(
            await page
                .locator('.tiptap td [data-template-field]')
                .filter({ hasText: 'Respuesta del docente' })
                .count(),
        );
        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    '[aria-label="Docente"] textarea, [aria-label="Docente"] input',
                ).length === 3,
        );
        const responseInputs = page.locator(
            '[aria-label="Docente"] textarea, [aria-label="Docente"] input',
        );
        assert.equal(await responseInputs.count(), 3);
        await responseInputs.nth(1).fill('Primer resultado\nSegundo resultado');
        await responseInputs.nth(2).fill('Respuesta independiente');
        assert.equal(
            await page.evaluate(
                (key) =>
                    window.fixture.values().find((field) => field.key === key)
                        .value,
                created[0].key,
            ),
            'Primer resultado\nSegundo resultado',
        );
        assert.equal(
            await page.evaluate(
                (key) =>
                    window.fixture.values().find((field) => field.key === key)
                        .value,
                created[1].key,
            ),
            'Respuesta independiente',
        );

        // A blank block reuses its initial response inside a new table. It does
        // not leave an orphan token above it or invent fields for every cell.
        await page.evaluate(() => {
            window.fixture.api().commands.setContent({
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'field',
                                attrs: {
                                    key: 'objetivo',
                                    label: 'Objetivo',
                                    kind: 'texto_largo',
                                    choice: null,
                                    listStyle: null,
                                },
                            },
                        ],
                    },
                ],
            });
        });
        assert.equal(
            await page
                .locator('.tiptap [data-template-field="objetivo"]')
                .innerText(),
            'Respuesta del docente',
        );
        await openMenu(
            editorSurface.locator('[data-template-field="objetivo"]'),
        );
        await page
            .getByRole('menuitem', { name: 'Insertar', exact: true })
            .hover();
        await page
            .getByRole('menuitem', { name: 'Tabla', exact: true })
            .hover();
        await page
            .getByRole('menuitem', { name: 'Tabla 3 × 3', exact: true })
            .click();
        assert.equal(await page.locator('.tiptap table').count(), 1);
        assert.equal(await page.locator('.tiptap > p').count(), 0);
        assert.equal(
            await page.locator('.tiptap [data-template-field]').count(),
            1,
        );
        assert.equal(
            await page
                .locator('.tiptap')
                .getByText(/^Dato \d/)
                .count(),
            0,
        );
        assert.equal(
            await page
                .locator('.tiptap tr')
                .nth(1)
                .locator('td')
                .first()
                .innerText()
                .then((text) => text.trim()),
            'Respuesta del docente',
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page
                .getByRole('region', { name: 'Administrador' })
                .screenshot({
                    path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT.replace(
                        '.png',
                        '-new-table.png',
                    ),
                    animations: 'disabled',
                });
        }

        await page.evaluate(() => {
            window.fixture.api().commands.setContent({
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'field',
                                attrs: {
                                    key: 'objetivo',
                                    label: 'Objetivo',
                                    kind: 'texto_largo',
                                },
                            },
                            {
                                type: 'field',
                                attrs: {
                                    key: 'resultado',
                                    label: 'Resultado esperado',
                                    kind: 'texto_largo',
                                },
                            },
                        ],
                    },
                ],
            });
        });
        assert.deepEqual(
            await page.locator('.tiptap [data-template-field]').allInnerTexts(),
            ['Objetivo', 'Resultado esperado'],
        );

        // Integration: the document-level mode keeps one draft per block,
        // preserves failures and delegates detailed properties to the side panel.
        await page.evaluate(() => window.fixture.openDesign());
        let designRegion = page.getByRole('region', {
            name: 'Editar diseño de Objetivo',
            exact: true,
        });
        await designRegion.waitFor();
        await page.evaluate(() => window.fixture.openProperties());
        let properties = page.getByRole('dialog', {
            name: 'Propiedades de Objetivo',
            exact: true,
        });
        await properties
            .getByLabel('Ayuda para el docente', { exact: true })
            .fill('Cambio descartado');
        await properties
            .getByText('Cambios sin guardar', { exact: true })
            .waitFor();
        assert.equal(
            await page.evaluate(() => {
                const event = new Event('beforeunload', { cancelable: true });
                window.dispatchEvent(event);

                return event.defaultPrevented;
            }),
            true,
        );
        await properties
            .getByRole('button', { name: 'Cerrar', exact: true })
            .click();
        await page.evaluate(() => window.fixture.closeDesign());
        await designRegion.waitFor({ state: 'hidden' });
        assert.equal(
            await page.evaluate(() => window.fixture.requests.length),
            0,
        );

        await page.evaluate(() => window.fixture.openDesign());
        designRegion = page.getByRole('region', {
            name: 'Editar diseño de Objetivo',
            exact: true,
        });
        await page.evaluate(() => window.fixture.openProperties());
        properties = page.getByRole('dialog', {
            name: 'Propiedades de Objetivo',
            exact: true,
        });
        assert.equal(
            await properties
                .getByLabel('Ayuda para el docente', { exact: true })
                .inputValue(),
            '',
        );
        await properties
            .getByLabel('Ayuda para el docente', { exact: true })
            .fill('Indique el objetivo con claridad.');
        await properties
            .getByLabel('Nombre del bloque', { exact: true })
            .fill('Objetivo renovado');
        await properties
            .getByRole('checkbox', {
                name: 'Permite asistencia de IA',
                exact: true,
            })
            .check();
        await properties
            .getByRole('button', { name: 'Cerrar', exact: true })
            .click();

        await designRegion.locator('.tiptap').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('Cambio persistente');
        await page.evaluate(() => window.fixture.openProperties());
        properties = page.getByRole('dialog', {
            name: 'Propiedades de Objetivo',
            exact: true,
        });
        assert.equal(
            await properties
                .getByLabel('Ayuda para el docente', { exact: true })
                .inputValue(),
            'Indique el objetivo con claridad.',
        );
        await properties
            .getByRole('button', { name: 'Cerrar', exact: true })
            .click();

        await page.evaluate(() =>
            window.fixture.fail({ document: 'Diseño inválido de prueba' }),
        );
        await page.evaluate(() => window.fixture.saveDesign());
        await designRegion
            .getByText('Diseño inválido de prueba', { exact: true })
            .waitFor();
        assert.match(
            await designRegion.locator('.tiptap').innerText(),
            /Cambio persistente/,
        );

        await page.evaluate(() =>
            window.fixture.fail({
                purge_required: 'Este cambio borrará 1 sílabo en curso.',
                purge_count: '1',
            }),
        );
        await page.evaluate(() => window.fixture.saveDesign());
        await designRegion
            .getByRole('button', { name: 'Guardar y reiniciar', exact: true })
            .waitFor();
        assert.equal(
            await page.evaluate(() => window.fixture.globalPurgeOpen()),
            false,
        );
        await designRegion
            .getByRole('button', { name: 'Guardar y reiniciar', exact: true })
            .click();

        const requests = await page.evaluate(() => window.fixture.requests);
        assert.equal(requests.length, 3);
        assert.equal(requests[0].fingerprint, 'a'.repeat(64));
        assert.equal(requests[0].confirm_purge, false);
        assert.equal(requests[2].confirm_purge, true);
        assert.deepEqual(requests[2].properties, [
            {
                key: 'objetivo',
                label: 'Objetivo renovado',
                help: 'Indique el objetivo con claridad.',
                ai_enabled: true,
            },
        ]);

        await page.evaluate(() => window.fixture.closeDesign());
        await page.evaluate(() => window.fixture.openDesign());
        designRegion = page.getByRole('region', {
            name: 'Editar diseño de Objetivo renovado',
            exact: true,
        });
        assert.match(
            await designRegion.locator('.tiptap').innerText(),
            /Cambio persistente/,
        );

        await openMenu(
            designRegion.locator('[data-template-field="objetivo"]'),
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT.replace(
                    '.png',
                    '-context-field.png',
                ),
                animations: 'disabled',
            });
        }

        await page
            .getByRole('menuitem', {
                name: 'Propiedades del campo',
                exact: true,
            })
            .click();
        properties = page.getByRole('dialog', {
            name: 'Propiedades de Objetivo renovado',
            exact: true,
        });
        assert.equal(
            await properties
                .getByLabel('Ayuda para el docente', { exact: true })
                .inputValue(),
            'Indique el objetivo con claridad.',
        );
        assert.equal(
            await properties
                .getByLabel('Nombre del bloque', { exact: true })
                .inputValue(),
            'Objetivo renovado',
        );
        assert.equal(
            await properties
                .getByRole('checkbox', {
                    name: 'Permite asistencia de IA',
                    exact: true,
                })
                .isChecked(),
            true,
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT.replace(
                    '.png',
                    '-properties.png',
                ),
                animations: 'disabled',
            });
        }

        await page.setViewportSize({ width: 360, height: 800 });
        assert.equal(
            await properties.evaluate(
                (element) => element.scrollWidth <= element.clientWidth,
            ),
            true,
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT.replace(
                    '.png',
                    '-properties-mobile.png',
                ),
                animations: 'disabled',
            });
        }

        await properties
            .getByRole('button', { name: 'Cerrar', exact: true })
            .click();
        await designRegion.locator('.tiptap').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, window.scrollY));
        const geometry = await designRegion.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const canvas = element.querySelector(
                '.template-document-editor',
            ).parentElement;

            return {
                left: box.left,
                right: box.right,
                canvasWidth: canvas.clientWidth,
                canvasScroll: canvas.scrollWidth,
            };
        });
        assert.ok(
            geometry.left >= 0 && geometry.right <= 360,
            JSON.stringify(geometry),
        );
        assert.ok(
            geometry.canvasScroll > geometry.canvasWidth,
            'The paper scrolls locally on mobile.',
        );

        await page.evaluate(() =>
            document.documentElement.classList.add('dark'),
        );
        assert.equal(
            await page
                .locator('[aria-label="Docente"] .template-document-view')
                .evaluate((node) => getComputedStyle(node).backgroundColor),
            'rgb(255, 255, 255)',
            'The teacher document keeps its white surface in dark mode.',
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT,
                animations: 'disabled',
            });
        }

        assert.deepEqual(errors, []);
    },
);
