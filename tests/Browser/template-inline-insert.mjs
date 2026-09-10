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
import { createApp, h } from 'vue';
import TemplateVisualBuilder from '/resources/js/components/domain/configuration/TemplateVisualBuilder.vue';
import { TooltipProvider } from '/resources/js/components/ui/tooltip/index.ts';
import '/resources/css/app.css';

const appearance = {
    font_family: 'Arial', body_font_size: 11, title_font_size: 16,
    section_font_size: 12, field_font_size: 11, text_color: '#000000',
    accent_color: '#0070C0', table_header_background: '#4F81BD',
    table_header_color: '#FFFFFF', margin_cm: 2.5, orientation: 'portrait',
    title_bold: true, title_italic: false, title_alignment: 'center',
    section_bold: true, section_italic: false, section_alignment: 'left',
    body_alignment: 'left',
};
const field = {
    id: 'field-1', block_id: 'block-1', key: 'descripcion',
    label: 'Descripción de la asignatura', type: 'markdown', required: true,
    inherited: false, teacher_editable: true, ai_enabled: false,
    content_type: 'text',
};
const template = {
    id: 'template-1', name: 'Plantilla', description: null, appearance,
    titleBlock: {text: 'PROGRAMA DE ASIGNATURA (SÍLABO)'},
    sections: [
        {id: 'section-1', key: 'descripcion', title: 'Descripción de la asignatura', description: null, blocks: [{
            id: 'block-1', key: 'descripcion', title: 'Descripción de la asignatura',
            type: 'narrativa', content_type: 'text', table: null, document: null,
            fingerprint: 'a'.repeat(64), fields: [field],
        }]},
        {id: 'section-2', key: 'nuevo', title: 'Bloque vacío', description: null, blocks: []},
    ],
};
const blockTypes = [
    {value: 'text', label: 'Texto'}, {value: 'table', label: 'Tabla'},
    {value: 'bulleted_list', label: 'Lista con viñetas'},
    {value: 'numbered_list', label: 'Lista numerada'},
];

createApp({render: () => h('main', {class: 'min-h-screen bg-muted p-6'}, [
    h(TooltipProvider, null, {default: () => h(TemplateVisualBuilder, {
        template, appearance, blockTypes, variables: [], readonly: false,
        logos: {
            institution: '/images/silabo/ueb.jpeg',
            faculty: '/images/silabo/facultad.jpeg',
            institution_size: {width: 1012, height: 190},
            faculty_size: {width: 600, height: 180},
        },
        identificationDesign: {type: 'doc', content: [{type: 'paragraph'}]},
        colorOptions: [],
    })}),
])}).mount('#app');
`;

test(
    'selected fields and blocks expose a small growing insertion control',
    { timeout: 60000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-template-inline-insert-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/domain/configuration/TemplateVisualBuilder.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'template-inline-insert-fixture',
                    resolveId: (id) =>
                        id === 'virtual:template-inline-insert-fixture'
                            ? id
                            : undefined,
                    load: (id) =>
                        id === 'virtual:template-inline-insert-fixture'
                            ? fixture
                            : undefined,
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><div id="app"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:template-inline-insert-fixture"></script></body></html>',
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
        assert.equal(await page.locator('[data-template-insert]').count(), 0);

        const selectedField = page.locator(
            'article[aria-label="Campo Descripción de la asignatura"]',
        );
        await selectedField.click();
        const fieldInsert = page.locator('[data-template-insert="content"]');
        const fieldButton = fieldInsert.getByRole('button', {
            name: 'Agregar contenido',
        });
        const before = await fieldButton.boundingBox();
        const selectedFieldBox = await selectedField.boundingBox();
        assert.ok(before && selectedFieldBox);
        assert.ok(before.width >= 28 && before.height >= 28);
        assert.ok(
            Math.abs(
                before.x +
                    before.width / 2 -
                    (selectedFieldBox.x + selectedFieldBox.width + 4),
            ) < 1,
        );
        const restingStyle = await fieldButton.evaluate((element) => {
            const style = getComputedStyle(element);

            return {
                opacity: style.opacity,
                visibility: style.visibility,
                borderStyle: style.borderTopStyle,
                backgroundColor: style.backgroundColor,
            };
        });
        assert.equal(restingStyle.opacity, '1');
        assert.equal(restingStyle.visibility, 'visible');
        assert.equal(restingStyle.borderStyle, 'none');
        assert.notEqual(restingStyle.backgroundColor, 'rgba(0, 0, 0, 0)');
        await fieldButton.hover();
        await page.waitForTimeout(200);
        const after = await fieldButton.boundingBox();
        assert.ok(before && after && after.width > before.width);
        const fieldTooltip = page
            .locator('[data-slot="tooltip-content"]')
            .filter({ hasText: 'Agregar contenido' });
        await fieldTooltip.waitFor();
        assert.equal(await fieldTooltip.getAttribute('data-side'), 'bottom');
        await fieldButton.click();
        assert.equal(
            await page.getByRole('button', { name: 'Agregar campo' }).count(),
            1,
        );
        assert.equal(
            await page.getByRole('button', { name: 'Agregar bloque' }).count(),
            1,
        );
        await page.getByRole('button', { name: 'Agregar campo' }).hover();
        await page.waitForTimeout(200);
        assert.equal(
            await page
                .locator('[data-slot="tooltip-content"]')
                .filter({ hasText: 'Agregar campo' })
                .count(),
            0,
        );
        await page.getByRole('button', { name: 'Agregar campo' }).click();
        const fieldSheet = page.locator('[data-slot="sheet-content"]');
        await fieldSheet.getByText('Nuevo campo', { exact: true }).waitFor();
        assert.equal(await fieldSheet.getByLabel('Nombre').count(), 1);
        await page.getByRole('button', { name: 'Cancelar' }).click();

        await page.locator('section[aria-label="Bloque Bloque vacío"]').click();
        assert.equal(
            await page.locator('[data-template-insert="content"]').count(),
            1,
        );
        const emptyBlockButton = page
            .locator('[data-template-insert="content"]')
            .getByRole('button', { name: 'Agregar contenido' });
        await emptyBlockButton.hover();
        await page
            .locator('[data-slot="tooltip-content"]')
            .filter({ hasText: 'Agregar contenido' })
            .waitFor();
        await emptyBlockButton.click();
        await page.getByRole('button', { name: 'Agregar bloque' }).click();
        const blockSheet = page.locator('[data-slot="sheet-content"]');
        await blockSheet.getByText('Nuevo bloque', { exact: true }).waitFor();
        assert.equal(
            await blockSheet.getByLabel('Nombre del bloque').count(),
            1,
        );
    },
);
