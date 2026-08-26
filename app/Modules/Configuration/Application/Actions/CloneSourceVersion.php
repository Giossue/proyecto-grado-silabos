<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CloneSourceVersion
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(SourceVersion $source, User $actor, Request $request): SourceVersion
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $request, $source): SourceVersion {
            $locked = SourceVersion::query()->with('fragments')->whereKey($source->id)->lockForUpdate()->firstOrFail();
            $latestVersion = SourceVersion::query()
                ->where('fuente_academica_id', $locked->fuente_academica_id)
                ->orderByDesc('numero_version')
                ->lockForUpdate()
                ->firstOrFail();
            $nextNumber = $latestVersion->numero_version + 1;
            $clone = SourceVersion::query()->create([
                'fuente_academica_id' => $locked->fuente_academica_id,
                'numero_version' => $nextNumber,
                'estado' => 'draft',
                'vigente_desde' => $locked->vigente_desde,
                'vigente_hasta' => $locked->vigente_hasta,
            ]);

            foreach ($locked->fragments as $fragment) {
                SourceFragment::query()->create([
                    ...$fragment->only([
                        'clave',
                        'titulo',
                        'contenido',
                        'clave_dato',
                        'valor_estructurado',
                        'metadatos',
                        'huella_sha256',
                        'posicion',
                    ]),
                    'version_fuente_id' => $clone->id,
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.version_cloned',
                resourceType: 'source_version',
                resourceId: $clone->id,
                result: 'success',
                metadata: ['source_version_id' => $locked->id],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $clone;
        });
    }
}
