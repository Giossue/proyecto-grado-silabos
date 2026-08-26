<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SetUserStatus
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $target, bool $active, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($active, $actor, $activeRole, $request, $target): User {
            $target->update([
                'active' => $active,
                'deactivated_at' => $active ? null : now(),
            ]);

            if (! $active) {
                DB::table('sessions')->where('user_id', $target->id)->delete();
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: $active ? 'user.activated' : 'user.deactivated',
                resourceType: 'user',
                resourceId: $target->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $target;
        });
    }
}
