import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { createServer } from 'vite';

// Uses an installed Playwright or an explicit external installation; no app/database.
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const root = fileURLToPath(new URL('../../', import.meta.url));

// Read the real defaults without booting Laravel, loading .env or connecting to a DB.
const baseline = JSON.parse(
    execFileSync(
        'php',
        [
            '-r',
            String.raw`
                require 'vendor/autoload.php';
                $container = new Illuminate\Container\Container;
                Illuminate\Container\Container::setInstance($container);
                $container->instance('config', new Illuminate\Config\Repository([
                    'syllabus_variables' => require 'config/syllabus_variables.php',
                ]));
                echo json_encode([
                    'identification' => App\Modules\Configuration\Application\TemplateDocumentDefaults::identification(),
                    'variables' => App\Modules\Configuration\Application\TemplateVariables::catalog(),
                    'planning' => App\Modules\Configuration\Domain\TablePresets::layout('planificacion'),
                    'evaluation' => App\Modules\Configuration\Domain\TablePresets::layout('indicadores'),
                ], JSON_THROW_ON_ERROR);
            `,
        ],
        { cwd: root, encoding: 'utf8' },
    ),
);

const fixture = `
import { createApp, h, ref } from 'vue';
import { router } from '@inertiajs/vue3';
import TemplateSheetEditor from '/resources/js/components/domain/configuration/TemplateSheetEditor.vue';
import { templatePreviewFields } from '/resources/js/lib/templatePreview.ts';
import '/resources/css/app.css';
const sections = ref([]);
const readonly = ref(false);
const identification = ref([]);
const identificationDesign = ref({ type: 'doc', content: [{ type: 'paragraph' }] });
const variables = ref([]);
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
    else if (Object.prototype.hasOwnProperty.call(data, 'document')) {
        sections.value = sections.value.map(section => ({...section, blocks: section.blocks.map(block => url.includes(block.id) ? {...block, title:data.title, document:JSON.parse(JSON.stringify(data.document)), fingerprint:'b'.repeat(64)} : block)}));
        options?.onSuccess?.({});
    }
    options?.onFinish?.();
};
window.fixture = {
    setSections(value) { sections.value = value; },
    setReadonly(value) { readonly.value = value; },
    setDefaults(value) {
        identificationDesign.value = value.identification;
        variables.value = value.variables;
    },
    previewFields: templatePreviewFields,
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
    identificationDesign: identificationDesign.value, variables: variables.value,
    institutionLogo: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="110" height="45"><text x="0" y="30">UEB</text></svg>',
}) }).mount('#app');
`;

function sections(count, longContent = false) {
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
                        type: 'texto_largo',
                    },
                ],
                // Stress pagination with explicit long content, not inflated previews.
                ...(longContent
                    ? {
                          document: {
                              type: 'doc',
                              content: [
                                  {
                                      type: 'paragraph',
                                      content: [
                                          {
                                              type: 'text',
                                              text: 'Contenido extenso de prueba para comprobar los saltos de página. '.repeat(
                                                  8,
                                              ),
                                          },
                                      ],
                                  },
                              ],
                          },
                      }
                    : {}),
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

            const institutional = sections(1);
            institutional[0].title = 'Identificación institucional';
            institutional[0].blocks[0].content_type = 'institutional';
            institutional[0].blocks[0].fields = [
                [
                    'discapacidad_tiene',
                    'Estudiantes con discapacidad',
                    'seleccion_unica',
                ],
                ['discapacidad_tipo', 'Tipo de discapacidad', 'texto_corto'],
                [
                    'discapacidad_adaptacion',
                    'Adaptación curricular',
                    'texto_corto',
                ],
                [
                    'formacion_experiencia',
                    'Formación y experiencia',
                    'markdown',
                ],
            ].map(([key, label, type]) => ({ id: key, key, label, type }));
            await page.evaluate(
                ({ baseline, sections }) => {
                    window.fixture.setDefaults(baseline);
                    window.fixture.setSections(sections);
                },
                { baseline, sections: institutional },
            );
            await page
                .getByText(
                    'Formación y experiencia en el área de la asignatura.',
                    { exact: true },
                )
                .waitFor();

            await page.waitForFunction(() => {
                const table = document.querySelector('.document-table');
                const paper = document.querySelector('.paged-document-paper');

                return (
                    table &&
                    table.getBoundingClientRect().bottom <=
                        paper.getBoundingClientRect().bottom -
                            (2.5 * 96) / 2.54 +
                            1 &&
                    document.querySelectorAll('.paged-document-paper')
                        .length === 1
                );
            });
            assert.equal(
                await page
                    .locator('.document-table tr:not([data-page-spacer])')
                    .count(),
                18,
            );
            assert.equal(
                await page.getByText('No aplica.', { exact: true }).count(),
                2,
            );
            assert.equal(
                await page
                    .getByText('Asignatura de ejemplo', { exact: true })
                    .count(),
                1,
            );
            assert.ok(
                (await page.locator('.document-value').allTextContents()).every(
                    (text) => text.length < 80,
                ),
            );

            if (process.env.PAGINATION_REFERENCE_SCREENSHOT) {
                await page.screenshot({
                    path: process.env.PAGINATION_REFERENCE_SCREENSHOT,
                    fullPage: true,
                });
            }

            const samples = await page.evaluate(
                (baseline) => ({
                    planning: window.fixture.previewFields(
                        [
                            {
                                key: 'unidades',
                                label: 'Unidades',
                                type: 'repetible',
                            },
                        ],
                        baseline.planning,
                    )[0],
                    typed: window.fixture.previewFields(
                        [
                            { key: 'numero', label: 'Número', type: 'numero' },
                            { key: 'fecha', label: 'Fecha', type: 'fecha' },
                            {
                                key: 'activo',
                                label: 'Activo',
                                type: 'booleano',
                            },
                            {
                                key: 'opcion',
                                label: 'Opción',
                                type: 'seleccion_unica',
                                options: [{ value: 'a', label: 'A' }],
                            },
                        ],
                        null,
                    ),
                }),
                baseline,
            );
            assert.equal(
                samples.planning.rows.filter((row) => row.data._kind !== 'unit')
                    .length,
                1,
            );
            assert.equal(
                samples.planning.rows[0].data.nombre,
                'Unidad de ejemplo',
            );
            assert.equal(samples.planning.rows[1].data.semana, 1);
            assert.deepEqual(
                samples.typed.map((field) => field.value),
                [2, '2026-03-01', false, 'a'],
            );

            const planning = sections(1);
            planning[0].blocks[0].content_type = 'table';
            planning[0].blocks[0].table = baseline.planning;
            planning[0].blocks[0].fields[0].type = 'repetible';
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                planning,
            );
            await page
                .getByText('Introducción a la unidad.', { exact: true })
                .waitFor();
            assert.equal(
                await page
                    .getByText('Unidad de ejemplo', { exact: true })
                    .count(),
                1,
            );
            assert.equal(
                await page.getByText('Total, horas', { exact: true }).count(),
                1,
            );

            const evaluation = sections(1);
            evaluation[0].blocks[0].content_type = 'table';
            evaluation[0].blocks[0].table = baseline.evaluation;
            evaluation[0].blocks[0].fields[0].type = 'repetible';
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                evaluation,
            );
            await page.getByText('Primer parcial', { exact: true }).waitFor();
            assert.equal(
                await page
                    .getByText('Segundo parcial', { exact: true })
                    .count(),
                1,
            );
            assert.equal(
                await page.getByText('Ponderación', { exact: true }).count(),
                2,
            );

            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(14, true),
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

            assert.equal(
                await page
                    .getByRole('button', {
                        name: 'Editar documento',
                        exact: true,
                    })
                    .count(),
                1,
            );
            await page
                .getByRole('button', {
                    name: 'Editar documento',
                    exact: true,
                })
                .click();
            await page.locator('.tiptap').first().click();
            await page.keyboard.press('Control+End');
            await page.keyboard.type(' Cambio global');
            await page
                .getByText('Hay cambios sin guardar', { exact: true })
                .waitFor();
            await page
                .getByRole('button', { name: 'Guardar', exact: true })
                .click();
            await page.waitForFunction(
                () => window.fixture.requests.length === 1,
            );
            await page
                .getByText(
                    'Clic derecho sobre el contenido para ver sus herramientas',
                    { exact: true },
                )
                .waitFor();
            assert.equal(
                await page.evaluate(
                    () => window.fixture.requests.splice(0).length,
                ),
                1,
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
            await page
                .getByRole('menuitem', { name: 'Renombrar', exact: true })
                .waitFor();
            assert.equal(
                await page
                    .getByRole('menuitem', {
                        name: 'Renombrar',
                        exact: true,
                    })
                    .count(),
                1,
            );
            await page.keyboard.press('Escape');

            // Choosing/cancelling a new block must not create an implicit text field.
            await page
                .getByRole('button', {
                    name: 'Acciones de Contenido',
                    exact: true,
                })
                .first()
                .click();
            assert.equal(
                await page
                    .getByRole('menuitem', { name: 'Renombrar', exact: true })
                    .count(),
                0,
            );
            await page
                .getByRole('menuitem', { name: 'Propiedades', exact: true })
                .click();
            const properties = page.getByRole('dialog', {
                name: 'Propiedades de Contenido',
                exact: true,
            });
            await properties.waitFor();
            await properties
                .getByRole('button', { name: 'Cerrar', exact: true })
                .click();
            await properties.waitFor({ state: 'hidden' });
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
            const target = page.locator(
                'section[aria-label="Bloque Descripción 2"]',
            );
            await page.evaluate(() => {
                document.addEventListener(
                    'drop',
                    () => {
                        window.fixture.beforeDrop = {
                            first: document
                                .querySelector('.doc-section')
                                ?.getAttribute('aria-label'),
                            requests: window.fixture.requests.length,
                        };
                    },
                    { once: true, capture: true },
                );
            });
            const targetBox = await target.boundingBox();
            await sourceHandle.dragTo(target, {
                targetPosition: { x: 80, y: targetBox.height - 10 },
            });
            assert.deepEqual(
                await page.evaluate(() => window.fixture.beforeDrop),
                {
                    first: 'Bloque Descripción 2',
                    requests: 0,
                },
                'The live order changes before the drop handler or transport runs',
            );
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

            await page
                .getByRole('button', {
                    name: 'Finalizar edición',
                    exact: true,
                })
                .click();
            const editableTable = sections(1);
            editableTable[0].blocks[0].document = {
                type: 'doc',
                content: [
                    {
                        type: 'table',
                        attrs: { repeatKey: null },
                        content: Array.from({ length: 24 }, (_, index) => ({
                            type: 'tableRow',
                            attrs: { rowRole: 'fixed' },
                            content: [
                                {
                                    type: 'tableCell',
                                    attrs: {
                                        colspan: 1,
                                        rowspan: 1,
                                        backgroundColor: null,
                                        colwidth: null,
                                    },
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [
                                                {
                                                    type: 'text',
                                                    text: `Fila editable ${index + 1}`,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        })),
                    },
                ],
            };
            await page.evaluate(
                (value) => window.fixture.setSections(value),
                editableTable,
            );
            await page
                .getByRole('button', {
                    name: 'Editar documento',
                    exact: true,
                })
                .click();
            const editableRows = page
                .locator('.tiptap table')
                .first()
                .locator('tr');
            await editableRows.first().waitFor();
            assert.equal(await editableRows.count(), 24);
            await page.evaluate(
                () =>
                    new Promise((resolve) => {
                        let remaining = 20;
                        const frame = () => {
                            remaining -= 1;

                            if (remaining === 0) {
                                resolve();

                                return;
                            }

                            requestAnimationFrame(frame);
                        };

                        requestAnimationFrame(frame);
                    }),
            );
            assert.equal(
                await editableRows.count(),
                24,
                'Pagination never inserts rows into a live Tiptap table',
            );
            assert.equal(
                await page.locator('.tiptap [data-page-spacer]').count(),
                0,
            );
            await page
                .getByRole('button', {
                    name: 'Finalizar edición',
                    exact: true,
                })
                .click();

            await page.evaluate(
                (value) => window.fixture.setSections(value),
                sections(14, true).reverse(),
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

            // A transparent spacer is insufficient if any ancestor paints over it.
            for (const dark of [false, true]) {
                await page.evaluate(
                    (dark) =>
                        document.documentElement.classList.toggle('dark', dark),
                    dark,
                );
                await page.evaluate(
                    () =>
                        new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve),
                            ),
                        ),
                );
                assert.equal(
                    await page
                        .locator('.document-table td')
                        .first()
                        .evaluate((node) => getComputedStyle(node).color),
                    'rgb(0, 0, 0)',
                );
                const paintedGap = await page.evaluate(() => {
                    const spacer = document.querySelector(
                        '.document-table [data-page-spacer] td',
                    );
                    const painted = [];

                    for (
                        let node = spacer;
                        node && !node.classList.contains('paged-document');
                        node = node.parentElement
                    ) {
                        const style = getComputedStyle(node);

                        if (
                            style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                            style.backgroundImage !== 'none'
                        ) {
                            painted.push(node.className || node.tagName);
                        }
                    }

                    return painted;
                });
                assert.deepEqual(
                    paintedGap,
                    [],
                    'No opaque rectangle covers the gap between sheets',
                );

                if (process.env.PAGINATION_GAP_SCREENSHOT) {
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.screenshot({
                        path: `${process.env.PAGINATION_GAP_SCREENSHOT}-${dark ? 'dark' : 'light'}.png`,
                        animations: 'disabled',
                        fullPage: true,
                    });
                }
            }

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
