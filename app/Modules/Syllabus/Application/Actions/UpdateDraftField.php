<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\DraftCompleteness;
use App\Modules\Syllabus\Domain\Exceptions\DraftConflictException;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\RepeatableRow;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UpdateDraftField
{
    public function __construct(
        private readonly DraftCompleteness $completeness,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{version_bloqueo: int, value?: mixed, rows?: list<array{id?: string|null, data: array<string, mixed>}>} $data */
    public function execute(Syllabus $syllabus, FieldDefinition $field, array $data, User $actor, Request $request): Syllabus
    {
        return DB::transaction(function () use ($actor, $data, $field, $request, $syllabus): Syllabus {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            if ($locked->version_bloqueo !== $data['version_bloqueo']) {
                throw new DraftConflictException($locked->version_bloqueo);
            }
            if (! in_array($locked->estado, ['borrador', 'correccion_solicitada'], true)) {
                throw ValidationException::withMessages(['syllabus' => 'El expediente no está en estado editable.']);
            }
            if ($field->plantilla_id !== $locked->plantilla_id
                || $field->heredado || ! $field->editable_docente || $field->tipo === 'calculo') {
                throw ValidationException::withMessages(['field' => 'Este campo institucional no puede ser editado por el docente.']);
            }

            if ($field->tipo === 'repetible') {
                $this->syncRows($locked, $field, $data['rows'] ?? []);
            } else {
                FieldValue::query()->updateOrCreate([
                    'silabo_id' => $locked->id,
                    'definicion_campo_id' => $field->id,
                ], ['valor' => $data['value'] ?? null, 'heredado' => false, 'origen' => null]);
            }

            $result = $this->completeness->calculate($locked);
            $locked->update([
                'version_bloqueo' => $locked->version_bloqueo + 1,
                'porcentaje_completitud' => $result['percentage'],
                'guardado_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.campo_guardado',
                resourceType: 'silabo',
                resourceId: $locked->id,
                result: 'exito',
                metadata: ['field_key' => $field->clave, 'lock_version' => $locked->version_bloqueo],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }

    /** @param list<array{id?: string|null, data: array<string, mixed>}> $rows */
    private function syncRows(Syllabus $syllabus, FieldDefinition $field, array $rows): void
    {
        $existingRows = RepeatableRow::query()
            ->where('silabo_id', $syllabus->id)
            ->where('definicion_campo_id', $field->id)
            ->get()
            ->keyBy('id');
        $requestedIds = collect($rows)
            ->map(fn (array $row): ?string => $row['id'] ?? null)
            ->filter()
            ->values();

        foreach ($requestedIds as $rowId) {
            if (! $existingRows->has($rowId)) {
                throw ValidationException::withMessages(['rows' => 'Una fila ya no existe; recarga el borrador.']);
            }
        }

        $deleteQuery = RepeatableRow::query()
            ->where('silabo_id', $syllabus->id)
            ->where('definicion_campo_id', $field->id);
        if ($requestedIds->isNotEmpty()) {
            $deleteQuery->whereNotIn('id', $requestedIds);
        }
        $deleteQuery->delete();

        RepeatableRow::query()
            ->whereIn('id', $requestedIds)
            ->increment('posicion', 1000);

        foreach ($rows as $position => $row) {
            $rowId = $row['id'] ?? null;
            $model = $rowId !== null ? $existingRows->get($rowId) : null;
            if ($model !== null) {
                RepeatableRow::query()->whereKey($model->id)->update([
                    'datos' => $row['data'],
                    'posicion' => $position + 1,
                ]);

                continue;
            }

            RepeatableRow::query()->create([
                'silabo_id' => $syllabus->id,
                'definicion_campo_id' => $field->id,
                'datos' => $row['data'],
                'posicion' => $position + 1,
            ]);
        }
    }
}
