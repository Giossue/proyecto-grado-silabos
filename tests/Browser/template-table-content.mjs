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
import TemplateTableEditor from '/resources/js/components/domain/configuration/TemplateTableEditor.vue';
import { TooltipProvider } from '/resources/js/components/ui/tooltip/index.ts';
import '/resources/css/app.css';

const editor = ref(null);
const document = {
    type: 'doc', content: [{
        type: 'table', content: [{
            type: 'tableRow', content: [{
                type: 'tableCell', content: [{type: 'paragraph'}],
            }],
        }],
    }],
};
const fields = [{
    key: 'discapacidad_tiene', label: 'Estudiantes con discapacidad',
    type: 'seleccion_unica', inherited: false, teacher_editable: true,
    required: true,
    options: [{value: 'Sí', label: 'Sí'}, {value: 'No', label: 'No'}],
}, {
    key: 'formacion_experiencia', label: 'Formación y experiencia',
    type: 'markdown', inherited: false, teacher_editable: true,
    required: true, options: [],
}];
const variables = [{
    key: 'nombre_docente', label: 'Nombre del docente', sample: 'Docente Demo',
}];

window.fixture = {document: () => editor.value?.getDocument()};
createApp({render: () => h('main', {class: 'p-8'}, [
    h(TooltipProvider, null, {default: () => h(TemplateTableEditor, {
        ref: editor, document, fields, variables, pending: false,
        fontFamily: 'Arial', fontSize: 11, textColor: '#000000',
        bodyAlignment: 'left', colors: [{value: '#DBE5F1', label: 'Azul claro'}],
    })}),
])}).mount('#app');
`;

test(
    'table ribbon inserts automatic data, teacher fields and safe conditions',
    { timeout: 60000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-template-table-content-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/domain/configuration/TemplateTableEditor.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'template-table-content-fixture',
                    resolveId: (id) =>
                        id === 'virtual:template-table-content-fixture'
                            ? id
                            : undefined,
                    load: (id) =>
                        id === 'virtual:template-table-content-fixture'
                            ? fixture
                            : undefined,
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><div id="app"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:template-table-content-fixture"></script></body></html>',
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

        const page = await browser.newPage();
        await page.goto(`${server.resolvedUrls.local[0]}fixture`);
        const cell = page.locator('.template-table-editor td');
        await cell.click();

        const insert = page.getByRole('button', {
            name: 'Insertar contenido en la celda',
        });
        await insert.click();
        await page.getByRole('menuitem', { name: 'Dato automático' }).hover();
        await page
            .getByRole('menuitem', { name: /Nombre del docente/ })
            .click();

        await insert.click();
        await page.getByRole('menuitem', { name: 'Campo del docente' }).hover();
        await page
            .getByRole('menuitem', {
                name: 'Formación y experiencia',
                exact: true,
            })
            .click();

        await insert.click();
        await page.getByRole('menuitem', { name: 'Campo del docente' }).hover();
        await page.getByRole('menuitem', { name: 'Nuevo campo…' }).click();
        const dialog = page.getByRole('dialog', {
            name: 'Nuevo campo del docente',
        });
        await dialog
            .getByLabel('Nombre visible')
            .fill('Requiere acompañamiento');
        await dialog.getByRole('combobox').click();
        await page.getByRole('option', { name: 'Selección única' }).click();
        await dialog.getByLabel('Opciones').fill('Sí, No, No aplica');
        await dialog.getByRole('button', { name: 'Insertar campo' }).click();

        await insert.click();
        await page.getByRole('menuitem', { name: 'Marca condicional' }).hover();
        await page
            .getByRole('menuitem', {
                name: 'X si Requiere acompañamiento = Sí',
            })
            .click();

        const saved = await page.evaluate(() => window.fixture.document());
        const inline =
            saved.content[0].content[0].content[0].content[0].content;
        assert.equal(inline[0].type, 'variable');
        assert.equal(inline[0].attrs.id, 'nombre_docente');
        assert.equal(inline[1].type, 'field');
        assert.equal(inline[1].attrs.kind, 'markdown');
        assert.equal(inline[1].attrs.options, null);
        assert.deepEqual(inline[2].attrs.options, ['Sí', 'No', 'No aplica']);
        assert.equal(inline[3].attrs.choice, 'Sí');
    },
);
