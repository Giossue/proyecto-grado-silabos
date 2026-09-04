<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SyncConvocationSources
{
    public function execute(Convocation $convocation): int
    {
        $sourceIds = AcademicSource::query()->where('carrera_id', $convocation->carrera_id)->where('activo', true)->pluck('id');
        if ($sourceIds->isEmpty()) {
            throw ValidationException::withMessages(['convocation' => 'La carrera no tiene fuentes académicas activas. Regístrelas antes de iniciar la convocatoria.']);
        }

        foreach ($sourceIds as $sourceId) {
            DB::table('fuentes_convocatoria')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'convocatoria_id' => $convocation->id,
                'fuente_academica_id' => $sourceId, 'creado_en' => now(), 'actualizado_en' => now(),
            ]);
        }

        return $sourceIds->count();
    }
}
