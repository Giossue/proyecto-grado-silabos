<?php

it('limpia los tokens de recuperacion y restringe los hosts fuera de desarrollo', function (): void {
    $root = dirname(__DIR__, 2);
    $console = (string) file_get_contents($root.'/routes/console.php');
    $application = (string) file_get_contents($root.'/bootstrap/app.php');

    expect($console)
        ->toContain("Schedule::command('auth:clear-resets')->everyFifteenMinutes()->withoutOverlapping()")
        ->and($application)->toContain('$middleware->trustHosts(at: [\'^127\\\\.0\\\\.0\\\\.1$\', \'^localhost$\']);');
});
