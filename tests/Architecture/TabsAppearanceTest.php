<?php

it('RNF UI mantiene la pestaña activa con el color de la acción principal', function (): void {
    $trigger = (string) file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/ui/tabs/TabsTrigger.vue',
    );

    expect($trigger)
        ->toContain('data-[state=active]:bg-primary')
        ->toContain('data-[state=active]:text-primary-foreground')
        ->toContain('data-[state=active]:hover:bg-primary/90')
        ->not->toContain('data-[state=active]:bg-background')
        ->not->toContain('dark:data-[state=active]:bg-input/30');
});
