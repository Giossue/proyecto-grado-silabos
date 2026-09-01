<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;

class DraftCompleteness
{
    /** @return array{percentage: float, completed: int, total: int} */
    public function calculate(Syllabus $syllabus): array
    {
        $fields = FieldDefinition::query()
            ->where('version_plantilla_id', $syllabus->version_plantilla_id)
            ->where('obligatorio', true)
            ->get(['id', 'tipo']);
        $values = $syllabus->values()->get()->keyBy('definicion_campo_id');
        $rowCounts = $syllabus->rows()
            ->selectRaw('definicion_campo_id, count(*) as aggregate')
            ->groupBy('definicion_campo_id')
            ->pluck('aggregate', 'definicion_campo_id');

        $completed = $fields->filter(function (FieldDefinition $field) use ($values, $rowCounts): bool {
            if ($field->tipo === 'repetible') {
                return (int) ($rowCounts[$field->id] ?? 0) > 0;
            }

            $value = $values->get($field->id)?->valor;

            return $this->isFilled($value);
        })->count();
        $total = $fields->count();

        return [
            'percentage' => $total === 0 ? 100.0 : round(($completed / $total) * 100, 2),
            'completed' => $completed,
            'total' => $total,
        ];
    }

    private function isFilled(mixed $value): bool
    {
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_array($value)) {
            return $value !== [];
        }

        return true;
    }
}
