<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La tabla de control del migrador no puede renombrarse dentro de una migración: el
 * repositorio de migraciones se consulta antes de ejecutarlas y, si la tabla configurada
 * (`migraciones`) no existiera, el migrador la crearía vacía y consideraría pendiente
 * todo el historial. Este comando corre antes de `migrate` (entrypoint del contenedor o
 * procedimiento remoto de hardening.md) y es idempotente.
 */
class RenameMigrationsTableCommand extends Command
{
    protected $signature = 'db:rename-migrations-table {--force : No pedir confirmación (producción)}';

    protected $description = 'Renombra la tabla de control migrations a migraciones si aún conserva el nombre antiguo';

    public function handle(): int
    {
        if (Schema::hasTable('migraciones')) {
            $this->info('La tabla migraciones ya existe; no hay nada que renombrar.');

            return self::SUCCESS;
        }

        if (! Schema::hasTable('migrations')) {
            $this->info('No existe una tabla migrations que renombrar (instalación nueva).');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm('¿Renombrar la tabla migrations a migraciones?')) {
            return self::FAILURE;
        }

        DB::statement('ALTER TABLE migrations RENAME TO migraciones');
        DB::statement('ALTER INDEX IF EXISTS migrations_pkey RENAME TO migraciones_pkey');
        DB::statement('ALTER SEQUENCE IF EXISTS migrations_id_seq RENAME TO migraciones_id_seq');

        $this->info('Tabla migrations renombrada a migraciones.');

        return self::SUCCESS;
    }
}
