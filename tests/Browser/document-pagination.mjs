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
import TemplateSheetEditor from '/resources/js/components/domain/configuration/TemplateSheetEditor.vue';
import '/resources/css/app.css';
const sections = ref([]);
const readonly = ref(false);
const identification = ref([]);
window.fixture = {
    setSections(value) { sections.value = value; },
    setReadonly(value) { readonly.value = value; },
    setIdentification(value) { identification.value = value; },
};
createApp({ render: () => h(TemplateSheetEditor, {
    templateId: 'synthetic-template', sections: sections.value, readonly: readonly.value,
    blockTypes: [{value:'text',label:'Texto'}], identification: identification.value,
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
                        '.id-card tr:not([data-page-spacer]) td',
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
                    .locator('.id-card tr:not([data-page-spacer])')
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
