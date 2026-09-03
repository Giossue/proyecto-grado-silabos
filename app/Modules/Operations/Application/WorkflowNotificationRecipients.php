<?php

namespace App\Modules\Operations\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;

class WorkflowNotificationRecipients
{
    /** @return list<string> */
    public function coordinatorsFor(Syllabus $syllabus): array
    {
        $careerId = $syllabus->convocation()->value('carrera_id');
        if (! is_string($careerId)) {
            return [];
        }

        $ids = CoordinatorAssignment::query()
            ->where('carrera_id', $careerId)
            ->where('activo', true)
            ->where('vigente_desde', '<=', now())
            ->where(fn ($query) => $query
                ->whereNull('vigente_hasta')
                ->orWhere('vigente_hasta', '>', now()))
            ->whereHas('user', fn ($query) => $query->where('activo', true)->laborallyEffective())
            ->pluck('usuario_id')
            ->all();

        return $this->uniqueStrings($ids);
    }

    /** @return list<string> */
    public function teachersFor(Syllabus $syllabus): array
    {
        $ids = SyllabusCollaborator::query()
            ->where('silabo_id', $syllabus->id)
            ->whereHas('teacherAssignment', fn ($query) => $query
                ->where('activo', true)
                ->whereHas('user', fn ($query) => $query->where('activo', true)->laborallyEffective()))
            ->whereHas('user', fn ($query) => $query->where('activo', true)->laborallyEffective())
            ->pluck('usuario_id')
            ->all();

        return $this->uniqueStrings($ids);
    }

    /**
     * @param  iterable<mixed>  $values
     * @return list<string>
     */
    private function uniqueStrings(iterable $values): array
    {
        $strings = [];
        foreach ($values as $value) {
            if (is_string($value)) {
                $strings[] = $value;
            }
        }

        return array_values(array_unique($strings));
    }
}
