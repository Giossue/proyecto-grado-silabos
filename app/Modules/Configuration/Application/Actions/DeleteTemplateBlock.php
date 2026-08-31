<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeleteTemplateBlock
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(TemplateBlock $block, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);

        DB::transaction(function () use ($activeRole, $actor, $block, $request): void {
            $block->load('version');

            if ($block->version->estado !== 'draft') {
                throw ValidationException::withMessages(['block' => 'La versión publicada no admite cambios.']);
            }

            $block->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'template.block_deleted',
                resourceType: 'template_block',
                resourceId: $block->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
