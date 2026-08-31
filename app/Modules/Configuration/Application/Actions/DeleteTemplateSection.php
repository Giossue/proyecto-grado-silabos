<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeleteTemplateSection
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(TemplateSection $section, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);

        DB::transaction(function () use ($activeRole, $actor, $request, $section): void {
            $section->load('version');

            if ($section->version->estado !== 'draft') {
                throw ValidationException::withMessages(['section' => 'La versión publicada no admite cambios.']);
            }

            $section->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'template.section_deleted',
                resourceType: 'template_section',
                resourceId: $section->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
