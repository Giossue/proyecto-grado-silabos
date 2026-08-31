<?php

it('mantiene los botones secundarios textuales sin iconos de accion, salvo el agregador del constructor visual', function (): void {
    $root = dirname(__DIR__, 2);
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );
    $violations = [];

    foreach ($files as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $path = $file->getPathname();
        if (str_ends_with($path, '/components/DatePicker.vue')) {
            continue;
        }

        if (str_ends_with($path, '/components/domain/configuration/TemplateBlockBuilder.vue')) {
            continue;
        }

        $source = (string) file_get_contents($path);
        preg_match_all(
            '/import\s*\{(?<names>[^}]+)\}\s*from\s*[\'\"]@lucide\/vue[\'\"];?/s',
            $source,
            $imports,
        );
        $icons = collect($imports['names'])
            ->flatMap(fn (string $names): array => explode(',', $names))
            ->map(fn (string $name): string => trim($name))
            ->filter()
            ->map(function (string $name): string {
                $parts = preg_split('/\s+as\s+/', $name);

                return trim((string) end($parts));
            });

        preg_match_all('/<Button\b(?<attributes>[^>]*)>(?<body>.*?)<\/Button>/s', $source, $buttons, PREG_SET_ORDER);
        foreach ($buttons as $button) {
            if (! preg_match('/\bvariant="(?:outline|secondary)"/', $button['attributes'])
                || preg_match('/\bsize="icon(?:-[a-z]+)?"/', $button['attributes'])) {
                continue;
            }

            foreach ($icons as $icon) {
                if (str_contains($button['body'], '<'.$icon)) {
                    $violations[] = str_replace($root.'/', '', $path).": {$icon}";
                }
            }
        }
    }

    expect($violations)->toBe([]);
});
