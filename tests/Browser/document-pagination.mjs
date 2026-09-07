import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { createServer } from 'vite';

// Uses an installed Playwright or an explicit external installation; no app/database.
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const root = fileURLToPath(new URL('../../', import.meta.url));

const fixture = `
import { createApp, h, ref } from 'vue';
import { router } from '@inertiajs/vue3';
import TemplateSheetEditor from '/resources/js/components/domain/configuration/TemplateSheetEditor.vue';
import '/resources/css/app.css';
const sections = ref([]);
const readonly = ref(false);
const identification = ref([]);
const identificationDesign = ref({ type: 'doc', content: [{ type: 'paragraph' }] });
const requests = [];
let failOrder = false;
router.post = (url, data, options) => {
    requests.push({ method: 'post', url, data });
    if (data.first_field_content_type) {
        const next = [...sections.value];
        next.splice(data.position - 1, 0, {
            id: 'created-section', key: data.key, title: data.title, description: null,
            blocks: [{ id: 'created-block', key: data.first_field_key, title: data.first_field_label,
                content_type: data.first_field_content_type, table: null,
                fields: [{id: 'created-field', key: data.first_field_key, label: data.first_field_label}],
            }],
        });
        sections.value = next;
    }
    options?.onFinish?.();
};
router.patch = (url, data, options) => {
    requests.push({ method: 'patch', url, data });
    if (failOrder) { failOrder = false; options?.onError?.({ order: 'No se pudo guardar el orden.' }); }
    options?.onFinish?.();
};
window.fixture = {
    setSections(value) { sections.value = value; },
    setReadonly(value) { readonly.value = value; },
    setIdentification(value) {
        identification.value = value;
        identificationDesign.value = { type: 'doc', content: value.length ? [{ type: 'table', attrs: { repeatKey: null }, content: value.map(cells => ({ type: 'tableRow', content: cells.map(cell => ({ type: 'tableCell', attrs: { colspan: cell.span, rowspan: cell.rows }, content: [{ type: 'paragraph', content: [{ type: 'text', text: cell.text }] }] })) })) }] : [{ type: 'paragraph' }] };
    },
    requests,
    failOrder() { failOrder = true; },
};
createApp({ render: () => h(TemplateSheetEditor, {
    templateId: 'synthetic-template', sections: sections.value, readonly: readonly.value,
    blockTypes: [{value:'text',label:'Texto'}], identification: identification.value,
    identificationDesign: identificationDesign.value, variables: [],
    institutionLogo: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="110" height="45"><text x="0" y="30">UEB</text></svg>',
}) }).mount('#app');
`;

function sections(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `section-${index}`,
        key: `section_${index}`,
        title: `Descripción ${index + 1}`,
        description: null,
        blocks: [
            {
                id: `block-${index}`,
                key: `block_${index}`,
                title: 'Contenido',
                content_type: 'text',
                table: null,
                fields: [
                    {
                        id: `field-${index}`,
                        key: `field_${index}`,
                        label: 'Contenido',
                    },
                ],
            },
        ],
    }));
}

test(
    'ADM-06 paginates actual editor content without persisting page breaks',
    { timeout: 60000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-pagination-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/domain/configuration/TemplateSheetEditor.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'pagination-fixture',
                    resolveId(id) {
                        if (id === 'virtual:pagination-fixture') {
                            return id;
                        }
                    },
                    load(id) {
                        if (id === 'virtual:pagination-fixture') {
                            return fixture;
                        }
                    },
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><div class="overflow-x-clip"><header class="sticky top-0 z-30 h-16 bg-background">Plantilla</header><main id="app" class="overflow-x-clip p-6"></main></div><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:pagination-fixture"></script></body></html>',
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

        try {
            const page = await browser.newPage({
                viewport: { width: 1440, height: 1000 },
            });
            const errors = [];
            page.on('pageerror', (error) => {
                errors.push(error.message);
                context.diagnostic(error.message);
            });
            await page.goto(`${server.resolvedUrls.local[0]}fixture`);
            await page.waitForSelector('.paged-document-paper');
            assert.equal(
                await page.locator('.paged-document-paper').count(),
                1,
            );
            const dimensions = await page
                .locator('.paged-document-paper')
                .boundingBox();
            assert.ok(Math.abs(dimensions.width - 816) < 1);
            assert.ok(Math.abs(dimensions.height - 1056) < 1);
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(14),
            );
            await page.waitForFunction(
                () =>
                    document.querySelectorAll('.paged-document-paper').length >
                    2,
            );
            const count = await page.locator('.paged-document-paper').count();

            const misplaced = await page.evaluate(() => {
                const papers = [
                    ...document.querySelectorAll('.paged-document-paper'),
                ].map((node) => node.getBoundingClientRect());
                const margin = (2.5 * 96) / 2.54;

                return [...document.querySelectorAll('[data-page-unit]')]
                    .filter((node) => {
                        const rect = node.getBoundingClientRect();

                        return (
                            rect.height > 0 &&
                            !papers.some(
                                (paper) =>
                                    rect.top >= paper.top + margin - 1 &&
                                    rect.bottom <= paper.bottom - margin + 1,
                            )
                        );
                    })
                    .map((node) => node.textContent.slice(0, 60));
            });
            assert.deepEqual(
                misplaced,
                [],
                'Every unit belongs inside a page’s margins',
            );

            const paperBackground = await page
                .locator('.paged-document')
                .evaluate(
                    (node) =>
                        getComputedStyle(node.parentElement).backgroundColor,
                );
            assert.equal(
                paperBackground,
                'rgba(0, 0, 0, 0)',
                'No panel behind the sheets',
            );

            for (const width of [1440, 360]) {
                await page.setViewportSize({ width, height: 1000 });
                await page.evaluate(() => window.scrollTo(0, 1500));
                await page.waitForFunction(() => {
                    const rect = document
                        .querySelector('[aria-label="Piezas de la plantilla"]')
                        .getBoundingClientRect();

                    return (
                        rect.top >= 64 &&
                        rect.top <= 96 &&
                        rect.bottom <= innerHeight
                    );
                });
                assert.equal(
                    await page
                        .getByText('Arrastre a la hoja o pulse para agregar', {
                            exact: true,
                        })
                        .isVisible(),
                    true,
                );
            }

            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.evaluate(() => window.scrollTo(0, 0));

            if (process.env.PAGINATION_SCREENSHOT) {
                await page.screenshot({
                    path: process.env.PAGINATION_SCREENSHOT,
                    fullPage: true,
                });
            }

            await page
                .getByRole('button', {
                    name: 'Renombrar Descripción 10',
                    exact: true,
                })
                .click();
            const input = page.getByRole('textbox', {
                name: 'Nombre del bloque',
            });
            await input.fill(
                'Un título de prueba que mantiene el foco durante la paginación',
            );
            await page.waitForFunction(
                () =>
                    document.activeElement?.getAttribute('aria-label') ===
                    'Nombre del bloque',
            );
            await input.press('Escape');
            assert.equal(
                await page
                    .getByRole('button', {
                        name: 'Renombrar Descripción 10',
                        exact: true,
                    })
                    .count(),
                1,
            );

            const handle = page.getByRole('button', {
                name: 'Arrastrar Descripción 10',
                exact: true,
            });
            const dataTransfer = await page.evaluateHandle(
                () => new DataTransfer(),
            );
            await handle.dispatchEvent('dragstart', { dataTransfer });
            await page.waitForFunction(
                () => document.querySelectorAll('.doc-zone-open').length > 0,
            );
            await handle.dispatchEvent('dragend', { dataTransfer });
            await page.waitForFunction(
                () => document.querySelectorAll('.doc-zone-open').length === 0,
            );
            await page
                .getByRole('button', {
                    name: 'Acciones de Descripción 10',
                    exact: true,
                })
                .click();
            assert.equal(
                await page
                    .getByRole('menuitem', { name: 'Renombrar', exact: true })
                    .count(),
                1,
            );
            await page.keyboard.press('Escape');

            // Choosing/cancelling a new block must not create an implicit text field.
            await page
                .getByRole('button', { name: 'Bloque', exact: true })
                .click();
            const creation = page.getByRole('dialog', {
                name: 'Primer campo del bloque',
            });
            await creation.waitFor();
            assert.equal(
                await page.evaluate(() => window.fixture.requests.length),
                0,
            );
            await creation
                .getByRole('button', { name: 'Cancelar', exact: true })
                .click();
            assert.equal(
                await page.evaluate(() => window.fixture.requests.length),
                0,
            );
            await page
                .getByRole('button', { name: 'Bloque', exact: true })
                .click();
            await creation
                .getByRole('button', { name: 'Tabla', exact: true })
                .click();
            const created = await page.evaluate(() =>
                window.fixture.requests.splice(0),
            );
            assert.equal(created.length, 1);
            assert.equal(created[0].data.first_field_content_type, 'table');
            assert.equal(created[0].data.position, 15);
            await page
                .getByRole('textbox', { name: 'Nombre del bloque' })
                .waitFor();
            await page.waitForFunction(
                () =>
                    document.activeElement?.getAttribute('aria-label') ===
                    'Nombre del bloque',
            );
            await page
                .getByRole('textbox', { name: 'Nombre del bloque' })
                .press('Escape');

            // Native pointer drag: observe live order before releasing, then persist once.
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(3),
            );
            await page.evaluate(() => window.scrollTo(0, 0));
            const sourceHandle = page.getByRole('button', {
                name: 'Arrastrar Descripción 1',
                exact: true,
            });
            await sourceHandle.hover();
            const sourceBox = await sourceHandle.boundingBox();
            const targetBox = await page
                .locator('section[aria-label="Bloque Descripción 2"]')
                .boundingBox();
            await page.mouse.move(sourceBox.x + 5, sourceBox.y + 5);
            await page.mouse.down();
            await page.mouse.move(sourceBox.x + 10, sourceBox.y + 20, {
                steps: 4,
            });
            await page.mouse.move(
                targetBox.x + 80,
                targetBox.y + targetBox.height - 10,
                { steps: 10 },
            );
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('.doc-section')
                        ?.getAttribute('aria-label') === 'Bloque Descripción 2',
            );
            assert.equal(
                await page.evaluate(() => window.fixture.requests.length),
                0,
            );
            await page.mouse.up();
            await page.waitForFunction(
                () => window.fixture.requests.length === 1,
            );
            assert.deepEqual(
                await page.evaluate(
                    () => window.fixture.requests.splice(0)[0].data.section_ids,
                ),
                ['section-1', 'section-0', 'section-2'],
            );

            // Escape/dragend restores the pre-drag order without a write.
            const transfer = await page.evaluateHandle(
                () => new DataTransfer(),
            );
            const cancelHandle = page.getByRole('button', {
                name: 'Arrastrar Descripción 2',
                exact: true,
            });
            await cancelHandle.dispatchEvent('dragstart', {
                dataTransfer: transfer,
            });
            const cancelTarget = page.locator(
                'section[aria-label="Bloque Descripción 3"]',
            );
            const cancelBox = await cancelTarget.boundingBox();
            await cancelTarget.dispatchEvent('dragover', {
                dataTransfer: transfer,
                clientY: cancelBox.y + cancelBox.height - 5,
            });
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('.doc-section')
                        ?.getAttribute('aria-label') === 'Bloque Descripción 1',
            );
            await cancelHandle.dispatchEvent('dragend', {
                dataTransfer: transfer,
            });
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('.doc-section')
                        ?.getAttribute('aria-label') === 'Bloque Descripción 2',
            );
            assert.equal(
                await page.evaluate(() => window.fixture.requests.length),
                0,
            );

            // Fields move only within their block; a rejected save restores server order.
            const multi = sections(2);
            multi[0].blocks = Array.from({ length: 3 }, (_, index) => ({
                ...multi[0].blocks[0],
                id: `multi-${index}`,
                title: `Campo ${index + 1}`,
                fields: [
                    {
                        id: `multi-field-${index}`,
                        key: `multi_field_${index}`,
                        label: `Campo ${index + 1}`,
                    },
                ],
            }));
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                multi,
            );
            const fieldHandle = page.getByRole('button', {
                name: 'Arrastrar Campo 1',
                exact: true,
            });
            const fieldTarget = page.locator(
                'article[aria-label="Campo Campo 2"]',
            );
            await fieldHandle.dispatchEvent('dragstart', {
                dataTransfer: transfer,
            });
            const fieldBox = await fieldTarget.boundingBox();
            await fieldTarget.dispatchEvent('dragover', {
                dataTransfer: transfer,
                clientY: fieldBox.y + fieldBox.height - 5,
            });
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('.doc-field')
                        ?.getAttribute('aria-label') === 'Campo Campo 2',
            );
            const otherSection = page.locator(
                'section[aria-label="Bloque Descripción 2"] article',
            );
            const otherBox = await otherSection.boundingBox();
            await otherSection.dispatchEvent('dragover', {
                dataTransfer: transfer,
                clientY: otherBox.y + 5,
            });
            assert.equal(
                await page
                    .locator(
                        'section[aria-label="Bloque Descripción 2"] article',
                    )
                    .count(),
                1,
            );
            await page.evaluate(() => window.fixture.failOrder());
            await fieldTarget.dispatchEvent('drop', { dataTransfer: transfer });
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('.doc-field')
                        ?.getAttribute('aria-label') === 'Campo Campo 1',
            );
            const failed = await page.evaluate(() =>
                window.fixture.requests.splice(0),
            );
            assert.equal(failed.length, 1);
            assert.deepEqual(failed[0].data.block_ids, [
                'multi-1',
                'multi-0',
                'multi-2',
            ]);
            await fieldHandle.dispatchEvent('dragend', {
                dataTransfer: transfer,
            });

            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(14).reverse(),
            );
            await page.waitForFunction(() =>
                document
                    .querySelector('.doc-h2')
                    ?.textContent.includes('Descripción 14'),
            );
            assert.equal(await page.locator('.doc-section').count(), 14);

            await page.evaluate(() => window.fixture.setReadonly(true));
            await page.waitForFunction(
                () =>
                    !document.querySelector(
                        '[aria-label="Piezas de la plantilla"]',
                    ),
            );
            assert.ok(
                (await page.locator('.paged-document-paper').count()) <= count,
            );
            await page.setViewportSize({ width: 360, height: 800 });
            assert.equal(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
                true,
            );

            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(1),
            );
            await page.waitForFunction(
                () =>
                    document.querySelectorAll('.paged-document-paper')
                        .length === 1,
            );
            // Long tables break between complete rowspan groups, never through cells.
            await page.setViewportSize({ width: 1440, height: 1000 });
            const tableSection = sections(1);
            tableSection[0].blocks[0].content_type = 'institutional';
            await page.evaluate((value) => {
                const cell = (text, span = 1, rows = 1) => ({
                    text,
                    span,
                    rows,
                    style: 'plain',
                    bold: false,
                    small: false,
                    center: false,
                });
                window.fixture.setIdentification(
                    Array.from({ length: 120 }, (_, index) =>
                        index % 3 === 0
                            ? [
                                  cell(`Grupo ${index / 3}`, 4, 3),
                                  cell(`Fila ${index}`, 5),
                              ]
                            : [cell(`Fila ${index}`, 5)],
                    ),
                );
                window.fixture.setSections(value);
            }, tableSection);
            await page.waitForFunction(
                () =>
                    document.querySelectorAll('.paged-document-paper').length >
                    2,
            );
            const tableErrors = await page.evaluate(() => {
                const margin = (2.5 * 96) / 2.54;
                const papers = [
                    ...document.querySelectorAll('.paged-document-paper'),
                ].map((node) => node.getBoundingClientRect());

                return [
                    ...document.querySelectorAll(
                        '.document-table tr:not([data-page-spacer]) td',
                    ),
                ]
                    .filter((node) => {
                        const rect = node.getBoundingClientRect();

                        return !papers.some(
                            (paper) =>
                                rect.top >= paper.top + margin - 1 &&
                                rect.bottom <= paper.bottom - margin + 1,
                        );
                    })
                    .map((node) => node.textContent);
            });
            assert.deepEqual(
                tableErrors,
                [],
                'Combined cells stay inside the printable area',
            );
            assert.equal(
                await page
                    .locator('.document-table tr:not([data-page-spacer])')
                    .count(),
                120,
            );
            await page.evaluate(() => window.fixture.setIdentification([]));
            await page.waitForFunction(
                () =>
                    document.querySelectorAll('.paged-document-paper')
                        .length === 1,
            );
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
            await server.close();
        }
    },
);
