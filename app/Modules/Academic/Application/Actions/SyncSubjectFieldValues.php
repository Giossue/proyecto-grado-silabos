<?php

namespace App\Modules\Academic\Application\Actions;

use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\SubjectFieldValue;
use Illuminate\Validation\ValidationException;

class SyncSubjectFieldValues
{
    /** @param array<string, mixed> $values */
    public function execute(Subject $subject, array $values): bool
    {
        if ($values === []) {
            return false;
        }

        $definitions = CurriculumFieldDefinition::query()
            ->where('version_malla_id', $subject->version_malla_id)
            ->where('activo', true)
            ->whereNull('clave_sistema')
            ->whereIn('id', array_keys($values))
            ->get()
            ->keyBy('id');

        if ($definitions->count() !== count($values)) {
            throw ValidationException::withMessages([
                'custom_values' => 'Uno de los campos no pertenece a esta versión de malla.',
            ]);
        }

        $changed = false;
        foreach ($values as $definitionId => $rawValue) {
            $definition = $definitions->get($definitionId);
            if (! $definition instanceof CurriculumFieldDefinition) {
                continue;
            }

            $value = $this->normalize($definition, $rawValue);
            $stored = SubjectFieldValue::query()->firstOrNew([
                'asignatura_id' => $subject->id,
                'definicion_campo_id' => $definition->id,
            ]);

            if ($value === null) {
                if ($stored->exists) {
                    $stored->delete();
                    $changed = true;
                }

                continue;
            }

            $stored->valor = $value;
            if (! $stored->exists || $stored->isDirty('valor')) {
                $stored->save();
                $changed = true;
            }
        }

        return $changed;
    }

    private function normalize(CurriculumFieldDefinition $definition, mixed $rawValue): bool|float|int|string|null
    {
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if ($definition->tipo === 'text') {
            if (! is_string($rawValue) || mb_strlen($rawValue) > 500) {
                throw ValidationException::withMessages([
                    "custom_values.{$definition->id}" => 'Ingrese un texto de máximo 500 caracteres.',
                ]);
            }

            return trim($rawValue);
        }

        if ($definition->tipo === 'boolean') {
            return filter_var($rawValue, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
                ?? throw ValidationException::withMessages([
                    "custom_values.{$definition->id}" => 'Seleccione un valor verdadero o falso.',
                ]);
        }

        if (! is_numeric($rawValue)) {
            throw ValidationException::withMessages([
                "custom_values.{$definition->id}" => 'Ingrese un valor numérico.',
            ]);
        }

        if ($definition->tipo === 'integer') {
            $integer = filter_var($rawValue, FILTER_VALIDATE_INT);
            if ($integer === false) {
                throw ValidationException::withMessages([
                    "custom_values.{$definition->id}" => 'Ingrese un número entero.',
                ]);
            }

            return $integer;
        }

        return (float) $rawValue;
    }
}
