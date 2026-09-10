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
import { TooltipProvider } from '/resources/js/components/ui/tooltip/index.ts';
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
    if (url.includes('/tabla')) {
        const {fingerprint, confirm_purge, ...table} = data;
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => ({
                ...section,
                blocks: section.blocks.map(block => url.includes(block.id)
                    ? {...block, table, document: null, fingerprint: 'c'.repeat(64)}
                    : block),
            })),
        };
    } else if (url.includes('/diseno')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => ({
                ...section,
                blocks: section.blocks.map(block => url.includes(block.id)
                    ? {...block, document: data.document, fingerprint: 'b'.repeat(64)}
                : block),
            })),
        };
    } else if (url.includes('/secciones/')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => url.includes(section.id)
                ? {...section, title: data.title}
                : section),
        };
    } else if (url.includes('/campos/')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => ({
                ...section,
                blocks: section.blocks.map(block => url.includes(block.fields[0]?.id)
                    ? {...block, title: data.label, content_type: data.content_type,
                        fields: block.fields.map((field, index) => index === 0
                            ? {...field, label: data.label, content_type: data.content_type}
                            : field)}
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
router.delete = async (url, visit) => {
    requests.push({method:'delete',url,data:{}});
    visit?.onStart?.({});
    if (url.includes('/secciones/')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.filter(section => !url.includes(section.id)),
        };
    } else if (url.includes('/bloques/')) {
        template.value = {
            ...template.value,
            sections: template.value.sections.map(section => ({
                ...section,
                blocks: section.blocks.filter(block => !url.includes(block.id)),
            })),
        };
    }
    await visit?.onSuccess?.({});
    visit?.onFinish?.({});
};
router.visit = (url, visit) => {
    requests.push({method:'visit',url:url.toString(),data:visit?.data ?? {}});
};
const triggerNavigation = (target, method = 'get') => document.dispatchEvent(new CustomEvent('inertia:before', {
    cancelable: true,
    detail: {visit: {
        id: 'synthetic-visit', url: new URL(target, window.location.href),
        completed: false, cancelled: false, interrupted: false,
        method, data: {}, replace: false, preserveScroll: false,
        preserveState: false, only: [], except: [], headers: {}, errorBag: '',
        forceFormData: false, queryStringArrayFormat: 'brackets', async: false,
        showProgress: true, prefetch: false, fresh: false, reset: [],
        preserveUrl: false, preserveErrors: false, invalidateCacheTags: [],
        viewTransition: false, component: null, pageProps: null, cached: false,
    }},
}));
window.fixture = {
    requests,
    appearance: () => appearance.value,
    triggerNavigation,
};

createApp({render: () => h('main', {class:'min-h-screen bg-muted p-6'}, [
    h('div', {class:'mb-4 flex justify-end'}, [
        h('button', {type:'button', onClick: () => appearanceOpen.value = true}, 'Personalizar'),
    ]),
    h(TooltipProvider, null, {default: () => h(TemplateVisualBuilder, {
        template: template.value, appearance: preview.value, blockTypes,
        variables: [], identificationDesign: {type:'doc',content:[{type:'paragraph'}]},
        colorOptions: options.colors, readonly: false, ribbon: true,
    })}),
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
        const nativeDialogs = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', async (dialog) => {
            nativeDialogs.push(dialog.message());
            await dialog.dismiss();
        });

        await page.goto(`${server.resolvedUrls.local[0]}fixture`);
        const firstBlockButton = page.getByRole('button', {
            name: 'Agregar primer bloque',
        });
        await firstBlockButton.click();
        const blockSheet = page.locator('[data-slot="sheet-content"]');
        await blockSheet
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
            await page.locator('#template-section-section-1').count(),
            1,
        );
        assert.equal(
            await page.locator('#template-field-field-block-1').count(),
            1,
        );
        assert.equal(
            await page.locator('#template-field-field-block-2').count(),
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

        const section = page.locator(
            'section[aria-label="Bloque Resultados y evidencias"]',
        );
        const ribbonTools = page.locator('#template-editor-ribbon-tools');
        await section.locator('h2').click();
        assert.equal(
            await section
                .getByRole('button', { name: 'Opciones del bloque' })
                .count(),
            0,
        );
        assert.equal(
            await section
                .getByRole('button', { name: 'Agregar campo' })
                .count(),
            0,
        );
        assert.equal(
            await section
                .getByRole('button', { name: 'Agregar bloque' })
                .count(),
            0,
        );
        await section
            .getByRole('button', { name: 'Agregar contenido' })
            .click();
        await page
            .locator('[data-slot="popover-content"]:visible')
            .getByRole('button', { name: 'Agregar campo', exact: true })
            .click();
        await page.getByText('Nuevo campo', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cancelar' }).click();
        await ribbonTools
            .getByRole('button', { name: 'Renombrar bloque', exact: true })
            .click();
        const blockDialog = page.getByRole('dialog', {
            name: 'Renombrar bloque',
        });
        await blockDialog
            .getByLabel('Nombre del bloque')
            .fill('Resultados actualizados');
        await blockDialog
            .getByRole('button', { name: 'Guardar nombre' })
            .click();
        await blockDialog.waitFor({ state: 'hidden' });
        const blockUpdate = await page.evaluate(() =>
            window.fixture.requests.find((request) =>
                request.url.includes('/secciones/section-1'),
            ),
        );
        assert.equal(blockUpdate.data.title, 'Resultados actualizados');

        const renamedSection = page.locator(
            'section[aria-label="Bloque Resultados actualizados"]',
        );
        const summaryField = page.locator('#template-field-field-block-1');
        await summaryField.click();
        await ribbonTools
            .getByRole('button', { name: 'Editar campo', exact: true })
            .click();
        const fieldDialog = page.getByRole('dialog', { name: 'Editar campo' });
        await fieldDialog
            .getByLabel('Nombre del campo')
            .fill('Resumen actualizado');
        await fieldDialog.getByLabel('Tipo de contenido').click();
        await page.getByRole('option', { name: 'Lista con viñetas' }).click();
        await fieldDialog
            .getByRole('button', { name: 'Guardar campo' })
            .click();
        await fieldDialog.waitFor({ state: 'hidden' });
        const fieldUpdate = await page.evaluate(() =>
            window.fixture.requests.find((request) =>
                request.url.includes('/campos/field-1'),
            ),
        );
        assert.equal(fieldUpdate.data.label, 'Resumen actualizado');
        assert.equal(fieldUpdate.data.content_type, 'bulleted_list');

        const tableField = page.locator('#template-field-field-block-2');
        await tableField.click();
        assert.equal(
            await tableField
                .getByRole('button', { name: /Editar tabla/ })
                .count(),
            0,
        );
        const editTableButton = ribbonTools.getByRole('button', {
            name: 'Editar tabla',
            exact: true,
        });
        assert.equal(
            await editTableButton.evaluate((button) =>
                Boolean(button.closest('#template-editor-ribbon-tools')),
            ),
            true,
        );
        await editTableButton.click();
        const tableEditor = tableField.getByRole('textbox', {
            name: 'Editar tabla de la plantilla',
        });
        await tableEditor.waitFor();
        assert.equal(
            await tableEditor.getByText('$texto', { exact: true }).count(),
            1,
        );
        assert.equal(
            await tableEditor.getByText('$detalle', { exact: true }).count(),
            1,
        );
        await tableEditor.locator('td').first().click();
        const dataButton = page.getByRole('button', {
            name: 'Datos: Fila que completa el docente',
        });
        await dataButton.click();
        await page
            .getByRole('menuitemcheckbox', { name: 'Organizar por unidades' })
            .click();
        await page.keyboard.press('Escape');
        await page
            .getByRole('button', { name: 'Insertar contenido en la celda' })
            .click();
        await page.getByRole('menuitem', { name: 'Dato repetible' }).hover();
        await page
            .getByRole('menuitem', { name: 'Nuevo dato de fila…' })
            .click();
        const dataSheet = page.locator('[data-slot="sheet-content"]');
        await dataSheet.getByLabel('Nombre visible').fill('Horas de clase');
        await dataSheet.getByLabel('Tipo de dato').click();
        await page.getByRole('option', { name: 'Número' }).click();
        await dataSheet.getByLabel('Función especial').click();
        await page.getByRole('option', { name: 'Horas ACD' }).click();
        await dataSheet.getByRole('button', { name: 'Insertar dato' }).click();
        await dataSheet.waitFor({ state: 'hidden' });
        assert.equal(
            await tableEditor
                .getByText('$horas_de_clase', {
                    exact: true,
                })
                .count(),
            1,
        );
        await page.getByRole('button', { name: 'Filas y columnas' }).click();
        await page.getByRole('menuitem', { name: 'Fila abajo' }).click();
        await tableEditor.locator('tr').last().locator('td').first().click();
        await page.getByRole('button', { name: /^Datos:/ }).click();
        await page
            .getByRole('menuitemradio', { name: 'Fila de totales' })
            .click();
        await page
            .getByRole('button', { name: 'Insertar contenido en la celda' })
            .click();
        await page.getByRole('menuitem', { name: 'Dato repetible' }).hover();
        await page.getByRole('menuitem', { name: /Horas de clase/ }).click();
        const mergeButton = page.getByRole('button', {
            name: 'Combinar celdas',
        });
        assert.equal(await mergeButton.isDisabled(), true);
        await page
            .locator('[data-slot="tooltip-trigger"]')
            .filter({ has: mergeButton })
            .hover();
        await page
            .locator('[data-slot="tooltip-content"]')
            .filter({ hasText: 'Combinar celdas' })
            .waitFor();
        const headers = tableEditor.locator('th');
        await headers.nth(0).click();
        await headers.nth(1).click({ modifiers: ['Shift'] });
        assert.equal(await mergeButton.isEnabled(), true);
        await mergeButton.click();
        const backgroundSelect = page.getByRole('combobox', {
            name: 'Fondo de celda',
        });
        await backgroundSelect.focus();
        await backgroundSelect.hover();
        await page
            .locator('[data-slot="tooltip-content"]')
            .filter({ hasText: 'Fondo de celda:' })
            .waitFor();
        await backgroundSelect.click();
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
        const ribbonActions = page.locator('#template-editor-ribbon-actions');
        const cancelTableButton = ribbonActions.getByRole('button', {
            name: 'Cancelar',
        });
        assert.equal(await cancelTableButton.locator('svg').count(), 0);
        await cancelTableButton.click();
        const discardDialog = page.getByRole('dialog', {
            name: 'Descartar cambios de tabla',
        });
        await discardDialog.waitFor();
        await discardDialog
            .getByRole('button', { name: 'Seguir editando' })
            .click();
        await discardDialog.waitFor({ state: 'hidden' });
        await tableEditor.waitFor();
        await ribbonActions
            .getByRole('button', { name: 'Guardar tabla' })
            .click();
        await tableEditor.waitFor({ state: 'hidden' });
        await editTableButton.waitFor();

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
        assert.equal(
            tableRequest.data.document.content[0].attrs.groupByUnit,
            true,
        );
        assert.equal(
            tableRequest.data.document.content[0].content.at(-1).attrs.rowRole,
            'total',
        );
        assert.equal(
            tableRequest.data.document.content[0].content
                .at(-1)
                .content.flatMap((cell) => cell.content)
                .flatMap((paragraph) => paragraph.content ?? [])
                .some((node) => node.attrs?.key === 'horas_de_clase'),
            true,
        );
        const insertedColumn = tableRequest.data.document.content[0].content
            .flatMap((row) => row.content)
            .flatMap((cell) => cell.content)
            .flatMap((paragraph) => paragraph.content ?? [])
            .find((node) => node.attrs?.key === 'horas_de_clase');
        assert.equal(insertedColumn.type, 'column');
        assert.equal(insertedColumn.attrs.kind, 'numero');
        assert.equal(insertedColumn.attrs.role, 'hours_acd');

        await tableField.click();
        await editTableButton.click();
        await tableEditor.waitFor();
        await tableField
            .getByRole('textbox', { name: 'Editar tabla de la plantilla' })
            .locator('th')
            .first()
            .click();
        await page
            .getByRole('button', {
                name: 'Cursiva en las celdas seleccionadas',
            })
            .click();
        assert.equal(
            await page.evaluate(() =>
                window.fixture.triggerNavigation('/guardar-tabla', 'patch'),
            ),
            true,
        );
        assert.equal(
            await page.evaluate(() =>
                window.fixture.triggerNavigation('/otra-pantalla'),
            ),
            false,
        );
        await discardDialog.waitFor();
        await discardDialog
            .getByRole('button', { name: 'Descartar cambios' })
            .click();
        await discardDialog.waitFor({ state: 'hidden' });
        assert.ok(
            await page.evaluate(() =>
                window.fixture.requests.find(
                    (request) =>
                        request.method === 'visit' &&
                        request.url.endsWith('/otra-pantalla'),
                ),
            ),
        );
        assert.deepEqual(nativeDialogs, []);

        await summaryField.click();
        await ribbonTools
            .getByRole('button', { name: 'Eliminar campo', exact: true })
            .click();
        const deleteFieldDialog = page.getByRole('dialog', {
            name: 'Eliminar campo',
        });
        await deleteFieldDialog
            .getByRole('button', { name: 'Eliminar campo' })
            .click();
        await deleteFieldDialog.waitFor({ state: 'hidden' });
        const fieldDeletion = await page.evaluate(() =>
            window.fixture.requests.find(
                (request) =>
                    request.method === 'delete' &&
                    request.url.includes('/bloques/field-block-1'),
            ),
        );
        assert.ok(fieldDeletion);

        await renamedSection.locator('h2').click();
        await ribbonTools
            .getByRole('button', { name: 'Eliminar bloque', exact: true })
            .click();
        const deleteBlockDialog = page.getByRole('dialog', {
            name: 'Eliminar bloque',
        });
        await deleteBlockDialog
            .getByRole('button', { name: 'Eliminar bloque' })
            .click();
        await deleteBlockDialog.waitFor({ state: 'hidden' });
        const blockDeletion = await page.evaluate(() =>
            window.fixture.requests.find(
                (request) =>
                    request.method === 'delete' &&
                    request.url.includes('/secciones/section-1'),
            ),
        );
        assert.ok(blockDeletion);

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
