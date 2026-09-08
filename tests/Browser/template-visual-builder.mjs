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
import { router } from '@inertiajs/vue3';
import TemplateAppearanceSheet from '/resources/js/components/domain/configuration/TemplateAppearanceSheet.vue';
import TemplateVisualBuilder from '/resources/js/components/domain/configuration/TemplateVisualBuilder.vue';
import '/resources/css/app.css';

const defaults = {
    font_family: 'Arial', body_font_size: 11, title_font_size: 16,
    section_font_size: 12, field_font_size: 11, text_color: '#000000',
    accent_color: '#0070C0', table_header_background: '#4F81BD',
    table_header_color: '#FFFFFF', margin_cm: 2.5, orientation: 'portrait',
    title_bold: true, title_italic: false, title_alignment: 'center',
    section_bold: true, section_italic: false, section_alignment: 'left',
    body_alignment: 'left',
};
const appearance = ref({...defaults});
const preview = ref({...defaults});
const appearanceOpen = ref(false);
const template = ref({id: 'synthetic-template', name: 'Plantilla', description: null, appearance: appearance.value, sections: []});
const requests = [];
const blockTypes = [
    {value:'text',label:'Texto'}, {value:'table',label:'Tabla'},
    {value:'bulleted_list',label:'Lista con viñetas'},
    {value:'numbered_list',label:'Lista numerada'},
];
const options = {
    fonts: ['Arial','Calibri','Times New Roman','Verdana','Georgia'].map(value => ({value,label:value})),
    body_sizes: [10,11,12].map(value => ({value,label:value + ' pt'})),
    title_sizes: [14,16,18].map(value => ({value,label:value + ' pt'})),
    section_sizes: [11,12,14].map(value => ({value,label:value + ' pt'})),
    field_sizes: [10,11,12].map(value => ({value,label:value + ' pt'})),
    margins: [1.5,2,2.5,3].map(value => ({value,label:value.toFixed(1) + ' cm'})),
    colors: [
        ['#000000','Negro'], ['#FFFFFF','Blanco'], ['#0070C0','Azul institucional'],
        ['#1F4E78','Azul oscuro'], ['#4F81BD','Azul medio'], ['#DBE5F1','Azul claro'],
        ['#595959','Gris'], ['#E7E6E6','Gris claro'], ['#C00000','Rojo'], ['#548235','Verde'],
    ].map(([value,label]) => ({value,label})),
    alignments: [['left','Izquierda'],['center','Centro'],['right','Derecha'],['justify','Justificado']].map(([value,label]) => ({value,label})),
    orientations: [{value:'portrait',label:'Vertical'},{value:'landscape',label:'Horizontal'}],
};
const minimalTable = {
    columns: [
        {key:'texto',label:'Contenido',type:'text',group:null,band:null,sum:false,width:null},
        {key:'detalle',label:'Detalle',type:'text',group:null,band:null,sum:false,width:null},
    ],
    groups: [], bands: [], header_fields: [], totals: {enabled:false,label:'Total'},
    repeat: {enabled:false,label:'Unidad'},
};
let sequence = 0;
const technicalBlock = (field, sectionId, position) => ({
    id: 'field-block-' + (++sequence), key: field.key, title: field.label,
    type: field.content_type === 'text' ? 'narrativa' : 'repetible',
    content_type: field.content_type,
    table: field.content_type === 'table' ? minimalTable : null,
    document: null, fingerprint: 'a'.repeat(64),
    fields: [{
        id: 'field-' + sequence, block_id: 'field-block-' + sequence,
        key: field.key, label: field.label, help: null,
        type: field.content_type === 'text' ? 'markdown' : 'repetible',
        required: true, inherited: false, master_source: null,
        teacher_editable: true, ai_enabled: false, document_marker: null,
        content_type: field.content_type,
    }],
});
router.post = async (url, data, visit) => {
    requests.push({method:'post',url,data:JSON.parse(JSON.stringify(data))});
    visit?.onStart?.({});
    if (url.includes('/secciones')) {
        const sectionId = 'section-' + (template.value.sections.length + 1);
        const next = [...template.value.sections];
        next.splice(data.position - 1, 0, {
            id: sectionId, key: data.key, title: data.title, description: null,
            blocks: data.fields.map((field, index) => technicalBlock(field, sectionId, index + 1)),
        });
        template.value = {...template.value, sections: next};
    }
    await visit?.onSuccess?.({});
    visit?.onFinish?.({});
};
router.patch = async (url, data, visit) => {
    requests.push({method:'patch',url,data:JSON.parse(JSON.stringify(data))});
    visit?.onStart?.({});
    if (url.includes('/diseno')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => ({
                ...section,
                blocks: section.blocks.map(block => url.includes(block.id)
                    ? {...block, document: data.document, fingerprint: 'b'.repeat(64)}
                    : block),
            })),
        };
    } else {
        appearance.value = {...data};
        preview.value = {...data};
        template.value = {...template.value, appearance: appearance.value};
    }
    await visit?.onSuccess?.({});
    visit?.onFinish?.({});
};
window.fixture = { requests, appearance: () => appearance.value };

createApp({render: () => h('main', {class:'min-h-screen bg-muted p-6'}, [
    h('div', {class:'mb-4 flex justify-end'}, [
        h('button', {type:'button', onClick: () => appearanceOpen.value = true}, 'Personalizar'),
    ]),
    h(TemplateVisualBuilder, {
        template: template.value, appearance: preview.value, blockTypes,
        variables: [], identificationDesign: {type:'doc',content:[{type:'paragraph'}]},
        colorOptions: options.colors, readonly: false,
    }),
    h(TemplateAppearanceSheet, {
        open: appearanceOpen.value, templateId: template.value.id,
        appearance: appearance.value, options,
        'onUpdate:open': value => appearanceOpen.value = value,
        onPreview: value => preview.value = value,
    }),
])}).mount('#app');
`;

test(
    'admin creates a block with typed fields and previews controlled appearance',
    { timeout: 60000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-template-visual-builder-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/domain/configuration/TemplateVisualBuilder.vue',
                    'resources/js/components/domain/configuration/TemplateAppearanceSheet.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'template-visual-builder-fixture',
                    resolveId: (id) =>
                        id === 'virtual:template-visual-builder-fixture'
                            ? id
                            : undefined,
                    load: (id) =>
                        id === 'virtual:template-visual-builder-fixture'
                            ? fixture
                            : undefined,
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><div id="app"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:template-visual-builder-fixture"></script></body></html>',
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
            viewport: { width: 1440, height: 1000 },
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));

        await page.goto(`${server.resolvedUrls.local[0]}fixture`);
        await page
            .getByRole('button', { name: 'Agregar primer bloque' })
            .click();
        await page
            .getByLabel('Nombre del bloque')
            .fill('Resultados y evidencias');
        await page.locator('#new-template-field-0').fill('Resumen');
        await page.getByRole('button', { name: 'Agregar otro campo' }).click();
        await page.locator('#new-template-field-1').fill('Matriz');
        await page.locator('#new-template-field-type-1').click();
        await page.getByRole('option', { name: 'Tabla', exact: true }).click();
        await page.getByRole('button', { name: 'Crear bloque' }).click();

        await page
            .getByRole('heading', { name: '1. Resultados y evidencias' })
            .waitFor();
        assert.equal(
            await page.getByRole('heading', { name: '1.1 Resumen' }).count(),
            1,
        );
        assert.equal(
            await page.getByRole('heading', { name: '1.2 Matriz' }).count(),
            1,
        );
        assert.equal(await page.locator('.document-table').count(), 1);
        const creation = await page.evaluate(() => window.fixture.requests[0]);
        assert.deepEqual(
            creation.data.fields.map((field) => field.content_type),
            ['text', 'table'],
        );

        await page
            .getByRole('button', { name: 'Editar tabla: Matriz' })
            .click();
        const tableEditor = page.getByRole('textbox', {
            name: 'Editar tabla de la plantilla',
        });
        const headers = tableEditor.locator('th');
        await headers.nth(0).click();
        await headers.nth(1).click({ modifiers: ['Shift'] });
        await page.getByRole('button', { name: 'Combinar' }).click();
        await page.getByRole('combobox', { name: 'Fondo de celda' }).click();
        await page.getByRole('option', { name: 'Azul claro' }).click();
        await page.getByRole('combobox', { name: 'Color de texto' }).click();
        await page.getByRole('option', { name: 'Blanco' }).click();
        await page
            .getByRole('combobox', { name: 'Alineación de celda' })
            .click();
        await page.getByRole('option', { name: 'Centro' }).click();
        await page.getByRole('combobox', { name: 'Borde de celda' }).click();
        await page.getByRole('option', { name: 'Grueso' }).click();
        await page
            .getByRole('button', {
                name: 'Negrita en las celdas seleccionadas',
            })
            .click();
        await page.getByRole('button', { name: 'Guardar tabla' }).click();
        await page
            .getByRole('button', { name: 'Editar tabla: Matriz' })
            .waitFor();

        const tableRequest = await page.evaluate(() =>
            window.fixture.requests.find((request) =>
                request.url.includes('/diseno'),
            ),
        );
        const header =
            tableRequest.data.document.content[0].content[0].content[0];
        assert.equal(header.attrs.colspan, 2);
        assert.equal(header.attrs.backgroundColor, '#DBE5F1');
        assert.equal(header.attrs.textColor, '#FFFFFF');
        assert.equal(header.attrs.textAlign, 'center');
        assert.equal(header.attrs.bold, true);
        assert.equal(header.attrs.borderStyle, 'thick');

        await page.getByRole('button', { name: 'Personalizar' }).click();
        const sheet = page.getByRole('dialog');
        await sheet.getByLabel('Orientación').click();
        await page.getByRole('option', { name: 'Horizontal' }).click();
        await sheet.getByLabel('Fuente general').click();
        await page.getByRole('option', { name: 'Georgia' }).click();
        await sheet
            .getByRole('combobox', { name: 'Título', exact: true })
            .click();
        await page.getByRole('option', { name: '18 pt' }).click();
        await sheet.locator('#template-accent_color').click();
        await page.getByRole('option', { name: 'Rojo' }).click();

        await page.waitForFunction(() => {
            const paper = document.querySelector('.paged-document-paper');

            return (
                paper &&
                Math.abs(paper.getBoundingClientRect().width - 1056) < 1
            );
        });
        const titleStyle = await page
            .locator('.paged-document-content h1')
            .evaluate((element) => {
                const style = getComputedStyle(element);

                return {
                    color: style.color,
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                };
            });
        assert.equal(titleStyle.color, 'rgb(192, 0, 0)');
        assert.match(titleStyle.fontFamily, /Georgia/);
        assert.equal(titleStyle.fontSize, '24px');

        await sheet.getByRole('button', { name: 'Guardar apariencia' }).click();
        await sheet.waitFor({ state: 'detached' });
        const saved = await page.evaluate(() => window.fixture.appearance());
        assert.equal(saved.orientation, 'landscape');
        assert.equal(saved.font_family, 'Georgia');
        assert.equal(saved.title_font_size, 18);
        assert.equal(saved.accent_color, '#C00000');

        await page.setViewportSize({ width: 360, height: 800 });
        assert.equal(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth ===
                    document.documentElement.clientWidth,
            ),
            true,
        );
        assert.deepEqual(errors, []);
    },
);
