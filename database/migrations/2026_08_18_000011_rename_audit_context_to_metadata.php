<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * La palabra «contexto» queda reservada para las fuentes académicas que alimentan al
 * asistente. Lo que guarda esta columna son los metadatos del evento auditado, así que
 * se nombra por lo que es.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE eventos_auditoria RENAME COLUMN contexto TO metadatos');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE eventos_auditoria RENAME COLUMN metadatos TO contexto');
    }
};
