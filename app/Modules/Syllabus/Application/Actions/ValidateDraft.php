<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\DraftCompleteness;
use App\Modules\Syllabus\Domain\PlanningTable;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationResult;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationRun;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ValidateDraft
{
    public const RULE_VERSION = 'planning-v2';

    public function __construct(
        private readonly DraftCompleteness $completeness,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(Syllabus $syllabus, User $actor, Request $request): ValidationRun
    {
        return DB::transaction(function () use ($actor, $request, $syllabus): ValidationRun {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            $fields = FieldDefinition::query()
                ->where('plantilla_id', $locked->plantilla_id)
                ->with('block')
                ->get();
            $values = $locked->values()->get()->keyBy('definicion_campo_id');
            $rows = $locked->rows()->orderBy('posicion')->get()->groupBy('definicion_campo_id');
            $academicContext = $locked->contexto_academico ?? [];
            if (data_get($academicContext, 'offering.teaching_weeks') === null) {
                data_set(
                    $academicContext,
                    'offering.teaching_weeks',
                    $locked->convocation->process->academicPeriod->semanas_lectivas,
                );
            }
            $issues = [];

            foreach ($fields as $field) {
                $fieldRows = $rows->get($field->id, collect());
                $missing = $field->obligatorio && ($field->tipo === 'repetible'
                    ? $fieldRows->isEmpty()
                    : ! $this->filled($values->get($field->id)?->valor));
                if ($missing) {
                    $issues[] = [
                        'field_id' => $field->id,
                        'code' => $field->heredado ? 'maestro_obligatorio_faltante' : 'campo_obligatorio_faltante',
                        'severity' => 'error',
                        'message' => $field->heredado
                            ? "No se pudo heredar el dato institucional «{$field->etiqueta}». Solicita corrección de la configuración."
                            : "Completa el campo obligatorio «{$field->etiqueta}».",
                    ];
                }

                $layout = $field->tipo === 'repetible' ? TableLayout::fromBlock($field->block) : null;
                if ($layout !== null && PlanningTable::applies($layout)) {
                    foreach (PlanningTable::issues($layout, $fieldRows, $academicContext) as $planningIssue) {
                        $issues[] = [
                            'field_id' => $field->id,
                            'code' => $planningIssue['code'],
                            'severity' => 'error',
                            'message' => $planningIssue['message'],
                        ];
                    }
                }
            }

            $summary = $this->completeness->calculate($locked);
            $run = ValidationRun::query()->create([
                'silabo_id' => $locked->id,
                'ejecutado_por' => $actor->id,
                'version_reglas' => self::RULE_VERSION,
                'estado' => 'completada',
                'version_bloqueo' => $locked->version_bloqueo,
                'errores_bloqueantes' => count($issues),
                'advertencias' => 0,
                'porcentaje_completitud' => $summary['percentage'],
                'completado_en' => now(),
            ]);
            foreach ($issues as $issue) {
                ValidationResult::query()->create([
                    'ejecucion_validacion_id' => $run->id,
                    'definicion_campo_id' => $issue['field_id'],
                    'codigo' => $issue['code'],
                    'severidad' => $issue['severity'],
                    'mensaje' => $issue['message'],
                ]);
            }
            $locked->update(['porcentaje_completitud' => $summary['percentage']]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.validado',
                resourceType: 'silabo',
                resourceId: $locked->id,
                result: 'exito',
                metadata: ['rule_version' => self::RULE_VERSION, 'blocking_errors' => count($issues)],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $run->load('results');
        });
    }

    private function filled(mixed $value): bool
    {
        return $value !== null && (! is_string($value) || trim($value) !== '') && (! is_array($value) || $value !== []);
    }
}
