<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Los nombres de las cuentas pasan a guardarse en mayúsculas, con tildes y sin espacios
 * sobrantes (I-32). Se normaliza lo ya guardado para que la regla sea verdad desde hoy.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("UPDATE usuarios SET nombre = upper(regexp_replace(btrim(nombre), '\\s+', ' ', 'g'))");
    }

    public function down(): void
    {
        // Las mayúsculas no guardan de dónde venían; no hay forma fiel de volver atrás.
    }
};
