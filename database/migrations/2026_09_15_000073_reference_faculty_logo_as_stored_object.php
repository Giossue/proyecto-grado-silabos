<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

return new class extends Migration
{
    private const DISK = 'private';

    public function up(): void
    {
        Schema::table('facultades', function (Blueprint $table): void {
            $table->foreignUuid('logo_objeto_id')
                ->nullable()
                ->constrained('objetos_almacenados')
                ->restrictOnDelete()
                ->unique();
        });

        $disk = Storage::disk(self::DISK);
        DB::table('facultades')
            ->whereNotNull('ruta_logo_facultad')
            ->orderBy('id')
            ->get(['id', 'ruta_logo_facultad'])
            ->each(function (object $faculty) use ($disk): void {
                $path = $faculty->ruta_logo_facultad;
                if (! is_string($path) || $path === '' || ! $disk->exists($path)) {
                    return;
                }

                $objectId = DB::table('objetos_almacenados')
                    ->where('disco', self::DISK)
                    ->where('ruta_interna', $path)
                    ->value('id');

                if (! is_string($objectId)) {
                    $contents = $disk->get($path);
                    $mime = $disk->mimeType($path);
                    $objectId = (string) Str::uuid();

                    DB::table('objetos_almacenados')->insert([
                        'id' => $objectId,
                        'disco' => self::DISK,
                        'ruta_interna' => $path,
                        'nombre_logico' => basename($path),
                        'mime' => is_string($mime) ? $mime : 'image/png',
                        'tamano_bytes' => $disk->size($path),
                        'huella_sha256' => hash('sha256', $contents),
                        'clasificacion' => 'logo_facultad',
                        'estado_objeto_almacenado' => 'activo',
                        'propietario_usuario_id' => null,
                        'carrera_id' => null,
                        'almacenado_en' => now(),
                    ]);
                }

                DB::table('facultades')->where('id', $faculty->id)->update(['logo_objeto_id' => $objectId]);
            });

        Schema::table('facultades', function (Blueprint $table): void {
            $table->dropColumn('ruta_logo_facultad');
        });
    }

    public function down(): void
    {
        Schema::table('facultades', function (Blueprint $table): void {
            $table->string('ruta_logo_facultad')->nullable();
        });

        DB::statement(<<<'SQL'
            UPDATE facultades AS facultad
            SET ruta_logo_facultad = objeto.ruta_interna
            FROM objetos_almacenados AS objeto
            WHERE objeto.id = facultad.logo_objeto_id
        SQL);

        DB::statement('ALTER TABLE facultades DROP CONSTRAINT IF EXISTS facultades_logo_objeto_id_foreign');
        DB::statement('DROP INDEX IF EXISTS facultades_logo_objeto_id_unique');
        Schema::table('facultades', function (Blueprint $table): void {
            $table->dropColumn('logo_objeto_id');
        });
    }
};
