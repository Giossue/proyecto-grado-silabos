<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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

it('I-52 no conserva marcas genéricas de auditoría en tablas de dominio', function () use ($tablasDeFramework) {
    $columnas = DB::table('information_schema.columns')
        ->where('table_schema', 'public')
        ->whereNotIn('table_name', $tablasDeFramework)
        ->whereIn('column_name', ['creado_en', 'actualizado_en', 'registrado_en'])
        ->get(['table_name', 'column_name'])
        ->map(fn ($column) => "{$column->table_name}.{$column->column_name}")
        ->all();

    expect($columnas)->toBe([]);
});

it('I-78 usa nombres explícitos para todos los atributos genéricos de dominio', function () use ($tablasDeFramework) {
    $nombresGenericos = [
        'codigo', 'nombre', 'descripcion', 'activo', 'estado', 'tipo', 'titulo',
        'contenido', 'valor', 'origen', 'clave', 'etiqueta', 'ayuda', 'reglas',
        'opciones', 'posicion', 'modalidad', 'fecha_inicio', 'fecha_fin',
        'semanas_lectivas', 'numero_ciclos', 'creditos', 'horas_totales',
        'orden_en_ciclo', 'unidad_organizacion_curricular', 'mapeo_documento',
        'configuracion', 'datos', 'advertencias', 'extracto', 'decision',
        'fotografia', 'justificacion', 'accion', 'metadatos', 'resultado', 'mensaje',
    ];

    $columnas = DB::table('information_schema.columns')
        ->where('table_schema', 'public')
        ->whereNotIn('table_name', $tablasDeFramework)
        ->whereIn('column_name', $nombresGenericos)
        ->get(['table_name', 'column_name'])
        ->map(fn ($column) => "{$column->table_name}.{$column->column_name}")
        ->all();

    expect($columnas)->toBe([])
        ->and(Schema::hasColumn('usuarios', 'nombre_usuario'))->toBeTrue()
        ->and(Schema::hasColumn('usuarios', 'usuario_activo'))->toBeTrue();
});

it('I-79 nombra la responsabilidad operativa como asignación a un paralelo', function () {
    expect(Schema::hasTable('asignaciones_paralelo'))->toBeTrue()
        ->and(Schema::hasTable('docentes_paralelo'))->toBeFalse();

    $restricciones = collect(DB::select(
        "SELECT conname
         FROM pg_constraint
         WHERE conrelid = 'asignaciones_paralelo'::regclass",
    ))->pluck('conname');

    expect($restricciones)
        ->toContain('asignaciones_paralelo_pkey')
        ->toContain('asignaciones_paralelo_paralelo_id_foreign')
        ->toContain('asignaciones_paralelo_asignacion_rol_id_foreign');
});

it('I-80 persiste los tres roles fijos en la asignación y no en un catálogo', function () {
    expect(Schema::hasTable('roles'))->toBeFalse()
        ->and(Schema::hasColumn('asignaciones_rol', 'rol'))->toBeTrue()
        ->and(Schema::hasColumn('asignaciones_rol', 'rol_id'))->toBeFalse();

    $restricciones = collect(DB::select(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'asignaciones_rol'::regclass",
    ))->pluck('conname');

    expect($restricciones)
        ->toContain('asignaciones_rol_rol_valido_check')
        ->toContain('asignaciones_rol_alcance_valido_check');
});

it('I-81 referencia el logo de facultad como objeto almacenado', function () {
    expect(Schema::hasColumn('facultades', 'logo_objeto_id'))->toBeTrue()
        ->and(Schema::hasColumn('facultades', 'ruta_logo_facultad'))->toBeFalse();

    $restricciones = collect(DB::select(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'facultades'::regclass",
    ))->pluck('conname');

    expect($restricciones)->toContain('facultades_logo_objeto_id_foreign');
});

it('I-62 persiste la programación de asignaturas con nombres e invariante propios', function () {
    expect(Schema::hasTable('programaciones_asignatura'))->toBeTrue()
        ->and(Schema::hasTable('ofertas_academicas'))->toBeFalse()
        ->and(Schema::hasColumn('paralelos', 'programacion_asignatura_id'))->toBeTrue()
        ->and(Schema::hasColumn('paralelos', 'oferta_academica_id'))->toBeFalse()
        ->and(Schema::hasColumn('alcances_silabo', 'programacion_asignatura_id'))->toBeTrue()
        ->and(Schema::hasColumn('alcances_silabo', 'oferta_academica_id'))->toBeFalse();

    $restricciones = collect(DB::select(
        "SELECT conname
         FROM pg_constraint
         WHERE conrelid = 'programaciones_asignatura'::regclass",
    ))->pluck('conname');

    expect($restricciones)
        ->toContain('programacion_asignatura_periodo_materia_unica')
        ->toContain('programaciones_asignatura_periodo_academico_id_foreign')
        ->toContain('programaciones_asignatura_asignatura_id_foreign')
        ->toContain('programaciones_asignatura_id_not_null')
        ->not->toContain('ofertas_academicas_id_not_null');
});
