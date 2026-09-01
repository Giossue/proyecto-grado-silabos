<?php

it('presenta un estado vacio compartido en todas las tablas', function (): void {
    $root = dirname(__DIR__, 2);
    $component = (string) file_get_contents(
        $root.'/resources/js/components/ui/table/TableEmpty.vue',
    );

    expect($component)
        ->toContain('import { Inbox } from "@lucide/vue"')
        ->toContain('<Empty')
        ->toContain('<EmptyMedia variant="icon"')
        ->toContain('<Inbox aria-hidden="true" />')
        ->toContain('<EmptyTitle')
        ->toContain('<slot />');

    $tableBodies = 0;
    $emptyStates = 0;
    $offenders = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());
        $bodyCount = substr_count($source, '<TableBody');

        if ($bodyCount === 0) {
            continue;
        }

        $stateCount = substr_count($source, '<TableEmpty');
        $tableBodies += $bodyCount;
        $emptyStates += $stateCount;

        if ($bodyCount !== $stateCount) {
            $offenders[] = str_replace($root.'/', '', $file->getPathname());
        }
    }

    sort($offenders);

    expect($offenders)->toBe([])
        ->and($tableBodies)->toBeGreaterThanOrEqual(23)
        ->and($emptyStates)->toBe($tableBodies);
});
