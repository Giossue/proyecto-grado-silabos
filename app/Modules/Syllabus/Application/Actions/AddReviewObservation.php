<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AddReviewObservation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        SyllabusRevision $revision,
        ?string $sectionKey,
        ?string $fieldKey,
        string $content,
        User $actor,
        Request $request,
    ): ReviewObservation {
        return DB::transaction(function () use ($actor, $content, $fieldKey, $request, $revision, $sectionKey): ReviewObservation {
            $syllabus = Syllabus::query()->lockForUpdate()->findOrFail($revision->silabo_id);
            $this->assertCurrentReview($syllabus, $revision);
            $this->assertSnapshotLocation($revision->fotografia, $sectionKey, $fieldKey);

            $observation = ReviewObservation::query()->create([
                'revision_silabo_id' => $revision->id,
                'clave_seccion' => $sectionKey,
                'clave_campo' => $fieldKey,
                'contenido' => $content,
                'estado' => 'abierta',
                'creado_por' => $actor->id,
                'observado_en' => now(),
            ]);
            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.observacion_agregada',
                resourceType: 'observacion_revision',
                resourceId: $observation->id,
                result: 'exito',
                metadata: ['revision_number' => $revision->numero_revision],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $observation;
        });
    }

    private function assertCurrentReview(Syllabus $syllabus, SyllabusRevision $revision): void
    {
        $latestId = SyllabusRevision::query()
            ->where('silabo_id', $syllabus->id)
            ->orderByDesc('numero_revision')
            ->value('id');
        if ($syllabus->estado !== 'en_revision' || $latestId !== $revision->id) {
            throw ValidationException::withMessages([
                'revision' => 'Solo se puede observar la revisión vigente que está en revisión.',
            ]);
        }
    }

    /** @param array<string, mixed> $snapshot */
    private function assertSnapshotLocation(array $snapshot, ?string $sectionKey, ?string $fieldKey): void
    {
        if ($sectionKey === null && $fieldKey === null) {
            return;
        }
        if ($sectionKey === null) {
            throw ValidationException::withMessages(['section_key' => 'Selecciona la sección del campo observado.']);
        }

        foreach ($this->arrayList($snapshot['sections'] ?? null) as $section) {
            if (($section['key'] ?? null) !== $sectionKey) {
                continue;
            }
            if ($fieldKey === null) {
                return;
            }
            foreach ($this->arrayList($section['blocks'] ?? null) as $block) {
                foreach ($this->arrayList($block['fields'] ?? null) as $field) {
                    if (($field['key'] ?? null) === $fieldKey) {
                        return;
                    }
                }
            }
        }

        throw ValidationException::withMessages([
            'location' => 'La sección o el campo no pertenece al snapshot revisado.',
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function arrayList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, is_array(...)));
    }
}
