<?php

namespace App\Modules\Operations\Application\Actions;

use App\Modules\Operations\Infrastructure\Jobs\PlatformSmokeJob;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DispatchPlatformSmoke
{
    public function execute(string $idempotencyKey, ?string $correlationId = null): JobExecution
    {
        return DB::transaction(function () use ($idempotencyKey, $correlationId): JobExecution {
            $execution = JobExecution::query()->firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'type' => 'platform.smoke',
                    'status' => 'pending',
                    'correlation_id' => $correlationId ?? (string) Str::uuid(),
                ],
            );

            if ($execution->wasRecentlyCreated) {
                PlatformSmokeJob::dispatch($execution->id)->afterCommit();
            }

            return $execution;
        });
    }
}
