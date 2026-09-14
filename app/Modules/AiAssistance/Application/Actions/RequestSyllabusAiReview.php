<?php

namespace App\Modules\AiAssistance\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationRun;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RequestSyllabusAiReview
{
    public function __construct(private readonly RequestAiAnalysis $requestAnalysis) {}

    public function execute(
        Syllabus $syllabus,
        int $expectedLockVersion,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): int {
        return DB::transaction(function () use (
            $actor,
            $expectedLockVersion,
            $idempotencyKey,
            $request,
            $syllabus,
        ): int {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);

            if ($locked->version_bloqueo !== $expectedLockVersion) {
                throw ValidationException::withMessages([
                    'version_bloqueo' => 'El borrador cambió. Espere al autoguardado y vuelva a intentarlo',
                ]);
            }

            $validation = ValidationRun::query()
                ->where('silabo_id', $locked->id)
                ->where('version_bloqueo', $locked->version_bloqueo)
                ->latest('completado_en')
                ->first();

            if ((float) $locked->porcentaje_completitud < 100
                || $validation === null
                || $validation->errores_bloqueantes > 0) {
                throw ValidationException::withMessages([
                    'syllabus' => 'Complete y valide el sílabo sin errores antes de solicitar la revisión de IA',
                ]);
            }

            $values = FieldValue::query()
                ->where('silabo_id', $locked->id)
                ->get()
                ->keyBy('definicion_campo_id');
            $fields = FieldDefinition::query()
                ->where('plantilla_id', $locked->plantilla_id)
                ->where('ia_habilitada', true)
                ->where('editable_docente', true)
                ->where('heredado', false)
                ->whereIn('tipo', ['texto_corto', 'texto_largo', 'markdown'])
                ->orderBy('posicion')
                ->get()
                ->filter(function (FieldDefinition $field) use ($values): bool {
                    $value = $values->get($field->id)?->valor;

                    return is_string($value) && trim($value) !== '';
                });

            if ($fields->isEmpty()) {
                throw ValidationException::withMessages([
                    'syllabus' => 'No hay campos con contenido habilitados para la revisión de IA',
                ]);
            }

            foreach ($fields as $field) {
                $this->requestAnalysis->execute(
                    $locked,
                    $field,
                    $idempotencyKey,
                    $actor,
                    $request,
                );
            }

            return $fields->count();
        });
    }
}
