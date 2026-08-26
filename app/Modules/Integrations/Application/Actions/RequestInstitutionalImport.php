<?php

namespace App\Modules\Integrations\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Integrations\Domain\Contracts\AcademicRecordMapper;
use App\Modules\Integrations\Domain\Contracts\ImportReconciler;
use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Infrastructure\Jobs\SimulateInstitutionalImportJob;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportExecution;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class RequestInstitutionalImport
{
    public function __construct(
        private readonly InstitutionalDataReader $reader,
        private readonly AcademicRecordMapper $mapper,
        private readonly ImportReconciler $reconciler,
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        string $profile,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): ImportExecution {
        $existing = $this->existingIdempotent($profile, $idempotencyKey, $actor);
        if ($existing !== null) {
            return $existing;
        }
        if ((string) config('integrations.institutional_import.driver') === 'disabled') {
            throw ValidationException::withMessages([
                'profile' => 'La simulación institucional no está habilitada en este entorno.',
            ]);
        }

        return DB::transaction(function () use ($actor, $idempotencyKey, $profile, $request): ImportExecution {
            $existing = $this->existingIdempotent($profile, $idempotencyKey, $actor);
            if ($existing !== null) {
                return $existing;
            }

            $activeRole = $this->roles->resolve($request);
            $execution = ImportExecution::query()->create([
                'origen' => $this->reader->source(),
                'perfil' => $profile,
                'modo' => 'simulation',
                'version_contrato' => (string) config('integrations.institutional_import.contract_version'),
                'version_lector_solicitada' => $this->reader->version(),
                'version_mapper' => $this->mapper->version(),
                'version_reconciliador' => $this->reconciler->version(),
                'clave_idempotencia' => $idempotencyKey,
                'estado' => 'pending',
                'parametros' => [
                    'profile' => $profile,
                    'production_connection' => false,
                ],
                'solicitado_por' => $actor->id,
                'asignacion_rol_id' => $activeRole?->id,
                'solicitado_en' => now(),
            ]);

            $correlationId = $request->attributes->getString('correlation_id');
            $jobExecution = JobExecution::query()->create([
                'type' => 'import.simulation',
                'queue_name' => 'integrations',
                'status' => 'pending',
                'idempotency_key' => "import.simulation:{$execution->id}:{$idempotencyKey}",
                'correlation_id' => Str::isUuid($correlationId) ? $correlationId : (string) Str::uuid(),
                'resource_type' => 'import_execution',
                'resource_id' => $execution->id,
                'attempts' => 0,
                'max_attempts' => 3,
                'progress' => 0,
            ]);
            $execution->update(['ejecucion_trabajo_id' => $jobExecution->id]);

            SimulateInstitutionalImportJob::dispatch($execution->id)->afterCommit();
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'institutional_import.simulation_requested',
                resourceType: 'import_execution',
                resourceId: $execution->id,
                result: 'success',
                metadata: [
                    'profile' => $profile,
                    'mode' => 'simulation',
                    'production_connection' => false,
                ],
                correlationId: $jobExecution->correlation_id,
            );

            return $execution->refresh();
        });
    }

    private function existingIdempotent(string $profile, string $key, User $actor): ?ImportExecution
    {
        $execution = ImportExecution::query()
            ->where('perfil', $profile)
            ->where('clave_idempotencia', $key)
            ->first();
        if ($execution !== null && $execution->solicitado_por !== $actor->id) {
            abort(403);
        }

        return $execution;
    }
}
