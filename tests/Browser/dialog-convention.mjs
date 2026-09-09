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
import { Save } from '@lucide/vue';
import { Button } from '/resources/js/components/ui/button/index.ts';
import {
    Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
    DialogDescription,
} from '/resources/js/components/ui/dialog/index.ts';
import '/resources/css/app.css';

const open = ref(true);

createApp({render: () => h(Dialog, {
    open: open.value,
    'onUpdate:open': value => open.value = value,
}, {default: () => h(DialogContent, null, {default: () => [
    h(DialogHeader, null, {default: () => h(DialogTitle, null, {default: () => 'Guardar cambios'})}),
    h(DialogDescription, null, {default: () => 'Confirme la operación.'}),
    h(DialogFooter, null, {default: () => [
        h(DialogClose, {asChild: true}, {default: () => h(Button, {variant: 'outline'}, {default: () => 'Cancelar'})}),
        h(Button, null, {default: () => [h(Save, {'data-icon': true}), 'Guardar']}),
    ]}),
]})})}).mount('#app');
`;

test(
    'dialog requires an explicit action to close',
    { timeout: 30000 },
    async (context) => {
        const server = await createServer({
            root,
            cacheDir: 'node_modules/.vite-dialog-convention-test',
            configFile: false,
            resolve: { alias: { '@': `${root}resources/js` } },
            optimizeDeps: {
                entries: [
                    'resources/js/components/ui/dialog/DialogContent.vue',
                ],
            },
            plugins: [
                vue(),
                (await import('@tailwindcss/vite')).default(),
                {
                    name: 'dialog-convention-fixture',
                    resolveId: (id) =>
                        id === 'virtual:dialog-convention-fixture'
                            ? id
                            : undefined,
                    load: (id) =>
                        id === 'virtual:dialog-convention-fixture'
                            ? fixture
                            : undefined,
                    configureServer(server) {
                        server.middlewares.use(
                            '/fixture',
                            (_request, response) => {
                                response.setHeader('Content-Type', 'text/html');
                                response.end(
                                    '<!doctype html><html><body><div id="app"></div><script type="module" src="/@vite/client"></script><script type="module" src="/@id/virtual:dialog-convention-fixture"></script></body></html>',
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
        const dialog = page.getByRole('dialog', { name: 'Guardar cambios' });
        await dialog.waitFor();

        assert.equal(
            await dialog.locator('[data-slot="dialog-close"]').count(),
            1,
        );
        assert.equal(
            await dialog
                .getByRole('button', { name: 'Guardar' })
                .locator('svg')
                .count(),
            1,
        );
        await page
            .locator('[data-slot="dialog-overlay"]')
            .click({ position: { x: 8, y: 8 }, force: true });
        assert.equal(await dialog.isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), true);

        await dialog.getByRole('button', { name: 'Cancelar' }).click();
        await dialog.waitFor({ state: 'hidden' });
    },
);
