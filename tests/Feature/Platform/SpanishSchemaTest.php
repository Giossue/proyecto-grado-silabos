<?php

use Illuminate\Support\Facades\DB;

/**
 * I-28: el esquema físico completo queda en español. Este test recorre el esquema real
 * que producen las migraciones y falla si un identificador o un valor de CHECK vuelve a
 * introducir inglés. Excepciones documentadas: las columnas internas de las tablas que
 * los drivers de Laravel escriben con nombres fijos (sesiones, trabajos_fallidos,
 * restablecimientos_contrasena, migraciones) y las siglas técnicas.
 */
$partesInglesas = [
    'created', 'updated', 'deleted', 'name', 'email', 'password', 'active', 'status',
    'type', 'queue', 'payload', 'attempts', 'progress', 'started', 'finished', 'locale',
    'snapshot', 'lock', 'token', 'key', 'value', 'owner', 'expiration', 'user', 'agent',
    'activity', 'connection', 'exception', 'failed', 'batch', 'migration', 'remember',
    'secret', 'recovery', 'must', 'change', 'resource', 'correlation', 'gateway',
    'renderer', 'message', 'jobs', 'job', 'cache', 'sessions', 'outbox',
];

$tablasDeFramework = ['sesiones', 'trabajos_fallidos', 'restablecimientos_contrasena', 'migraciones'];

it('I-28 no conserva identificadores en inglés en tablas ni columnas propias', function () use ($partesInglesas, $tablasDeFramework) {
    $columnas = DB::select(
        "SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position",
    );

    $violaciones = [];
    foreach ($columnas as $columna) {
        foreach (explode('_', $columna->table_name) as $parte) {
            if (in_array($parte, $partesInglesas, true)) {
                $violaciones[] = "tabla {$columna->table_name}";
            }
        }
        if (in_array($columna->table_name, $tablasDeFramework, true)) {
            continue;
        }
        foreach (explode('_', $columna->column_name) as $parte) {
            if (in_array($parte, $partesInglesas, true)) {
                $violaciones[] = "{$columna->table_name}.{$columna->column_name}";
            }
        }
    }

    expect(array_values(array_unique($violaciones)))->toBe([]);
});

it('I-28 no conserva valores en inglés en los CHECK de estados', function () {
    $valoresIngleses = [
        'pending', 'running', 'completed', 'failed', 'draft', 'published', 'active',
        'inactive', 'historical', 'open', 'closed', 'preparation', 'not_started',
        'in_review', 'correction_requested', 'approved', 'submit', 'approve', 'reopen',
        'resubmit', 'request_correction', 'verified', 'responded', 'quarantined',
        'processing', 'processed', 'inconclusive', 'accepted', 'ignored', 'not_useful',
        'applied', 'clarity', 'consistency', 'warning', 'success', 'denied', 'group',
        'fields', 'narrative', 'workflow', 'short_text', 'long_text', 'single_select',
        'multi_select', 'boolean', 'calculation', 'master_reference', 'text', 'number',
        'integer', 'prerequisite', 'per_offering', 'per_parallel', 'start', 'review',
        'correction',
    ];

    $checks = DB::select(
        "SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
         FROM pg_constraint
         WHERE contype = 'c' AND connamespace = 'public'::regnamespace",
    );

    $violaciones = [];
    foreach ($checks as $check) {
        foreach ($valoresIngleses as $valor) {
            if (str_contains($check->definicion, "'{$valor}'")) {
                $violaciones[] = "{$check->tabla}.{$check->conname} conserva '{$valor}'";
            }
        }
    }

    expect($violaciones)->toBe([]);
});
