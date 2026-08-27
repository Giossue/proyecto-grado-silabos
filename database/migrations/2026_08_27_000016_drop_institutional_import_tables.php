<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retira las tablas de la importación institucional.
 *
 * El módulo se apoyaba en un respaldo de SIANET del 23 de junio de 2025, no en la base
 * viva: nadie garantizó que la estructura de hoy sea esa, y traer datos de personas
 * seguía sin base legal escrita. Se retira entero en lugar de sostener una simulación
 * que nunca aplicó un solo cambio.
 *
 * No hay vuelta atrás: las tablas se crearon vacías en cada entorno y solo guardaban
 * ensayos. Reconstruirlas sería reconstruir el módulo, y esa decisión traería su propia
 * migración.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Las funciones que vigilaban estas tablas sobrevivirían a un simple borrado.
        DB::unprepared('DROP FUNCTION IF EXISTS proteger_conflicto_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_conflicto_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_item_importacion() CASCADE');
        DB::unprepared('DROP FUNCTION IF EXISTS validar_ejecucion_importacion() CASCADE');

        Schema::dropIfExists('conflictos_importacion');
        Schema::dropIfExists('items_importacion');
        Schema::dropIfExists('ejecuciones_importacion');

        /*
         * `alias_institucionales` traducía el texto libre de la fuente hacia el catálogo
         * propio. Sin importación nadie escribe ahí. La crea una migración anterior que
         * ya corrió en los entornos, así que se retira aquí en vez de reescribirla.
         */
        Schema::dropIfExists('alias_institucionales');
    }

    public function down(): void
    {
        // Sin reverso: el módulo que daba sentido a estas tablas ya no existe.
    }
};
