<?php

/**
 * El cierre implícito hace perder formularios y confirmaciones por un clic accidental.
 * La convención vive en el componente compartido para que no dependa de recordar tres
 * eventos distintos en cada pantalla.
 */
it('hace persistentes todos los dialogos compartidos y elimina la equis', function (): void {
    $root = dirname(__DIR__, 2).'/resources/js/components/ui/dialog/';

    foreach (['DialogContent.vue', 'DialogScrollContent.vue'] as $file) {
        $source = (string) file_get_contents($root.$file);

        expect($source)
            ->toContain('@escape-key-down="preventImplicitDismiss"')
            ->toContain('@interact-outside="preventImplicitDismiss"')
            ->toContain('@pointer-down-outside="preventImplicitDismiss"')
            ->toContain('event.preventDefault()')
            ->not->toContain('<DialogClose')
            ->not->toContain('showCloseButton')
            ->not->toContain('from "@lucide/vue"');
    }
});

it('conserva una salida explicita en cada dialogo', function (): void {
    $root = dirname(__DIR__, 2);
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );
    $missing = [];

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());
        if (! str_contains($source, '@/components/ui/dialog')) {
            continue;
        }

        preg_match_all(
            '/<DialogContent\b[^>]*>(?<body>.*?)<\/DialogContent\s*>/s',
            $source,
            $dialogs,
        );

        foreach ($dialogs['body'] as $index => $body) {
            if (preg_match('/Cancelar|Seguir editando|Cerrar sesión|Volver/', $body)) {
                continue;
            }

            $path = str_replace($root.'/', '', $file->getPathname());
            $missing[] = $path.'#'.($index + 1);
        }
    }

    expect($missing)->toBe([]);
});

/**
 * Las acciones secundarias pueden ser solo texto. Guardar, confirmar o eliminar debe
 * conservar una señal visual además del color y de la etiqueta.
 */
it('mantiene un icono en cada accion principal declarada dentro de un dialogo', function (): void {
    $root = dirname(__DIR__, 2).'/resources/js';
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root));
    $missing = [];

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());
        if (! str_contains($source, '@/components/ui/dialog')) {
            continue;
        }

        preg_match_all('/<DialogContent\\b[^>]*>(.*?)<\\/DialogContent>/s', $source, $dialogs);
        foreach ($dialogs[1] as $dialog) {
            preg_match_all('/<Button\\b([^>]*)>(.*?)<\\/Button>/s', $dialog, $buttons, PREG_SET_ORDER);
            foreach ($buttons as $button) {
                $attributes = $button[1];
                $body = $button[2];
                if (preg_match('/variant="(?:outline|secondary|ghost|link)"/', $attributes)) {
                    continue;
                }

                preg_match_all('/<([A-Z][A-Za-z0-9]*)\\b/', $body, $children);
                $icons = array_values(array_filter(
                    $children[1],
                    fn (string $component): bool => $component !== 'Spinner',
                ));

                if ($icons === [] && ! str_contains($body, '<component')) {
                    $label = trim((string) preg_replace('/\\s+/', ' ', strip_tags($body)));
                    $missing[] = $file->getFilename().': '.$label;
                }
            }
        }
    }

    expect($missing)->toBe([]);
});
