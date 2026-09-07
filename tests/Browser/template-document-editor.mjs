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
const saved = ref(null);
const values = ref([{ id: 'field-test', key: 'objetivo', label: 'Objetivo', type: 'texto_largo', value: '', rows: [], teacher_editable: true, required: true }]);
const doc = { type: 'doc', content: [paragraph([textNode('Texto de prueba')]), {type:'table', content: [
 {type:'tableRow', content:[cellNode([textNode('A')]),cellNode([textNode('B')]),cellNode([textNode('C')])]},
 {type:'tableRow', content:[cellNode([fieldNode(values.value[0])]),cellNode([textNode('E')]),cellNode([textNode('F')])]},
 {type:'tableRow', content:[cellNode([textNode('G')]),cellNode([textNode('H')]),cellNode([textNode('I')])]},
]}, paragraph()]};
window.fixture = { api: () => component.value.editor, save: () => component.value.save(), saved: () => saved.value, value: () => values.value[0].value };
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
  block.value = {...block.value, document: JSON.parse(JSON.stringify(data.document)), fingerprint: 'b'.repeat(64)};
  await options.onSuccess?.({});
 }
 options.onFinish?.(visit);
};
createApp({render: () => h('div', {}, [
 h('section', {style:'height:850px;display:flex;flex-direction:column', 'aria-label':'Administrador'}, [h(Editor, {ref:component, document:doc, variables:[{key:'nombre_carrera',label:'Nombre de la carrera',sample:'Software'}], pending:false, onSave: value => saved.value = JSON.parse(JSON.stringify(value))})]),
 saved.value ? h('section', {'aria-label':'Docente'}, [h(View, {document:saved.value,fields:values.value,variables:{nombre_carrera:'Software real'},editable:true, onValue: (key,value) => values.value = values.value.map(f => f.key === key ? {...f,value} : f)})]) : null,
 h(DesignBlock, { templateId:'synthetic-template', block:block.value, identification:doc, variables:[{key:'nombre_carrera',label:'Nombre de la carrera',sample:'Software'}], readonly:false }),
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
        await page.evaluate(() =>
            window.fixture.api().commands.setTextSelection({ from: 1, to: 16 }),
        );
        await page
            .getByRole('button', { name: 'Negrita', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Cursiva', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Alinear a la derecha', exact: true })
            .click();
        await page.getByRole('combobox', { name: 'Tipo de fuente' }).click();
        await page
            .getByRole('option', { name: 'Times New Roman', exact: true })
            .click();
        await page.getByRole('combobox', { name: 'Tamaño de fuente' }).click();
        await page.getByRole('option', { name: '14 pt', exact: true }).click();
        await page
            .getByLabel('Color de fuente', { exact: true })
            .fill('#cc0000');
        await page.evaluate(() => window.fixture.api().commands.focus('end'));
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
        await page
            .getByRole('button', { name: 'Combinar celdas', exact: true })
            .click();
        assert.equal(
            await page.locator('.tiptap td').first().getAttribute('colspan'),
            '2',
        );
        assert.match(
            await page.locator('.tiptap td').first().innerText(),
            /A[\s\S]*B/,
        );
        await selectCells(0, 0);
        await page
            .getByRole('button', { name: 'Separar celda', exact: true })
            .click();
        assert.equal(await page.locator('.tiptap td').count(), 9);
        await selectCells(0, 3);
        await page
            .getByRole('button', { name: 'Combinar celdas', exact: true })
            .click();
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
        assert.equal(style.color, '#cc0000');
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

        // Integration: the actual dialog retains local edits on errors, owns its
        // purge confirmation and reopens the persisted document with a new fingerprint.
        await page
            .getByRole('button', { name: 'Editar diseño de Objetivo' })
            .click();
        const dialog = page.getByRole('dialog', {
            name: 'Diseño: Objetivo',
            exact: true,
        });
        await dialog.locator('.tiptap').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('Cambio persistente');
        await page.evaluate(() =>
            window.fixture.fail({ document: 'Diseño inválido de prueba' }),
        );
        await dialog
            .getByRole('button', { name: 'Guardar diseño', exact: true })
            .click();
        await dialog
            .getByText('Diseño inválido de prueba', { exact: true })
            .waitFor();
        assert.match(
            await dialog.locator('.tiptap').innerText(),
            /Cambio persistente/,
        );
        await page.evaluate(() =>
            window.fixture.fail({
                purge_required: 'Este cambio borrará 1 sílabo en curso.',
                purge_count: '1',
            }),
        );
        await dialog
            .getByRole('button', { name: 'Guardar diseño', exact: true })
            .click();
        await dialog
            .getByRole('button', { name: 'Guardar y reiniciar', exact: true })
            .waitFor();
        assert.equal(
            await page.evaluate(() => window.fixture.globalPurgeOpen()),
            false,
        );
        await dialog
            .getByRole('button', { name: 'Guardar y reiniciar', exact: true })
            .click();
        await dialog.waitFor({ state: 'hidden' });
        const requests = await page.evaluate(() => window.fixture.requests);
        assert.equal(requests.length, 3);
        assert.equal(requests[0].fingerprint, 'a'.repeat(64));
        assert.equal(requests[0].confirm_purge, false);
        assert.equal(requests[2].confirm_purge, true);
        await page
            .getByRole('button', { name: 'Editar diseño de Objetivo' })
            .click();
        assert.match(
            await dialog.locator('.tiptap').innerText(),
            /Cambio persistente/,
        );
        assert.deepEqual(errors, []);

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT,
                fullPage: false,
                animations: 'disabled',
            });
        }

        await page.setViewportSize({ width: 360, height: 800 });
        await dialog.locator('.tiptap').scrollIntoViewIfNeeded();
        const geometry = await dialog.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const canvas = element.querySelector(
                '.template-document-editor',
            ).parentElement;

            return {
                left: box.left,
                right: box.right,
                canvasHeight: canvas.clientHeight,
                canvasWidth: canvas.clientWidth,
                canvasScroll: canvas.scrollWidth,
            };
        });
        assert.ok(
            geometry.left >= 0 && geometry.right <= 360,
            JSON.stringify(geometry),
        );
        assert.ok(geometry.canvasHeight >= 250, JSON.stringify(geometry));
        assert.ok(
            geometry.canvasScroll > geometry.canvasWidth,
            'The paper scrolls locally on mobile.',
        );
        assert.ok(
            await dialog
                .getByRole('button', { name: 'Guardar diseño', exact: true })
                .isVisible(),
        );
        await page.evaluate(() =>
            document.documentElement.classList.add('dark'),
        );

        if (process.env.TEMPLATE_DOCUMENT_SCREENSHOT) {
            await page.screenshot({
                path: process.env.TEMPLATE_DOCUMENT_SCREENSHOT.replace(
                    /\.png$/,
                    '-mobile.png',
                ),
                animations: 'disabled',
            });
        }

        assert.deepEqual(errors, []);
    },
);
