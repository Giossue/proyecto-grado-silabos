<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ActivateSourceVersion
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly CanonicalHasher $hasher,
    ) {}

    /** @return array{activated: bool, conflicts: int} */
    public function execute(string $versionId, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $request, $versionId): array {
            $candidate = SourceVersion::query()
                ->with(['source:id,carrera_id,activo', 'fragments'])
                ->whereKey($versionId)
                ->lockForUpdate()
                ->firstOrFail();

            if ($candidate->estado !== 'draft') {
                throw ValidationException::withMessages(['version' => 'La versión ya no está en borrador.']);
            }

            if ($candidate->fragments->isEmpty()) {
                throw ValidationException::withMessages(['version' => 'Agregue al menos un fragmento antes de activar.']);
            }

            $conflicts = $this->detectConflicts($candidate);

            if ($conflicts > 0) {
                return ['activated' => false, 'conflicts' => $conflicts];
            }

            SourceVersion::query()
                ->where('fuente_academica_id', $candidate->fuente_academica_id)
                ->where('estado', 'active')
                ->update(['estado' => 'superseded', 'updated_at' => now()]);
            $candidate->update([
                'estado' => 'active',
                'huella_sha256' => $this->hasher->hash($candidate->fragments
                    ->map(fn (SourceFragment $fragment) => [
                        'key' => $fragment->clave,
                        'fingerprint' => $fragment->huella_sha256,
                    ])->values()->all()),
                'activado_por' => $actor->id,
                'activado_en' => now(),
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.version_activated',
                resourceType: 'source_version',
                resourceId: $candidate->id,
                result: 'success',
                metadata: ['fingerprint' => $candidate->huella_sha256],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return ['activated' => true, 'conflicts' => 0];
        });
    }

    private function detectConflicts(SourceVersion $candidate): int
    {
        $candidateFragments = $candidate->fragments->whereNotNull('clave_dato');

        if ($candidateFragments->isEmpty()) {
            return 0;
        }

        $activeFragments = SourceFragment::query()
            ->whereIn('clave_dato', $candidateFragments->pluck('clave_dato')->all())
            ->whereHas('version', fn ($query) => $query
                ->where('estado', 'active')
                ->where('fuente_academica_id', '!=', $candidate->fuente_academica_id)
                ->whereHas('source', fn ($sourceQuery) => $sourceQuery
                    ->where('carrera_id', $candidate->source->carrera_id)
                    ->where('activo', true)))
            ->with('version:id,fuente_academica_id')
            ->get();
        $blocking = 0;

        foreach ($candidateFragments as $candidateFragment) {
            foreach ($activeFragments->where('clave_dato', $candidateFragment->clave_dato) as $activeFragment) {
                if ($candidateFragment->huella_sha256 === $activeFragment->huella_sha256) {
                    continue;
                }

                $conflict = SourceConflict::query()->firstOrCreate(
                    [
                        'version_candidata_id' => $candidate->id,
                        'version_activa_id' => $activeFragment->version_fuente_id,
                        'clave_dato' => $candidateFragment->clave_dato,
                    ],
                    [
                        'huella_candidata' => $candidateFragment->huella_sha256,
                        'huella_activa' => $activeFragment->huella_sha256,
                        'estado' => 'pending',
                    ],
                );

                if ($conflict->estado !== 'resolved' || $conflict->decision !== 'candidate') {
                    $blocking++;
                }
            }
        }

        return $blocking;
    }
}
