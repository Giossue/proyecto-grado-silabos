<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceFragment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AddSourceFragment
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly CanonicalHasher $hasher,
    ) {}

    /** @param array<string, mixed> $data */
    public function execute(string $versionId, array $data, User $actor, Request $request): SourceFragment
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $versionId): SourceFragment {
            $version = SourceVersion::query()->whereKey($versionId)->lockForUpdate()->firstOrFail();

            if ($version->estado !== 'draft') {
                throw ValidationException::withMessages(['version' => 'La fuente activada no admite nuevos fragmentos.']);
            }

            $content = $data['content'] ?? null;
            $structuredValue = $data['structured_value'] ?? null;
            $fingerprintedValue = $structuredValue ?? $content;
            $fragment = SourceFragment::query()->create([
                'version_fuente_id' => $version->id,
                'clave' => $data['key'],
                'titulo' => $data['title'],
                'contenido' => $content,
                'clave_dato' => $data['data_key'] ?? null,
                'valor_estructurado' => $structuredValue,
                'metadatos' => $data['metadata'] ?? null,
                'huella_sha256' => $this->hasher->hash($fingerprintedValue),
                'posicion' => ((int) SourceFragment::query()
                    ->where('version_fuente_id', $version->id)
                    ->max('posicion')) + 1,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'source.fragment_created',
                resourceType: 'source_fragment',
                resourceId: $fragment->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $fragment;
        });
    }
}
