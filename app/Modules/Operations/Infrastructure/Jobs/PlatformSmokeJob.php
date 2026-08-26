<?php

namespace App\Modules\Operations\Infrastructure\Jobs;

use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class PlatformSmokeJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 30;

    /** @var list<int> */
    public array $backoff = [1, 5, 15];

    public function __construct(public readonly string $executionId)
    {
        $this->onQueue('critical');
    }

    public function handle(): void
    {
        DB::transaction(function (): void {
            $execution = JobExecution::query()->lockForUpdate()->find($this->executionId);

            if ($execution === null || $execution->status === 'completed') {
                return;
            }

            $execution->update([
                'status' => 'completed',
                'attempts' => max(1, $this->attempts()),
                'progress' => 100,
                'result' => ['message' => 'platform-smoke-ok'],
                'started_at' => $execution->started_at ?? now(),
                'finished_at' => now(),
                'error_code' => null,
                'error_message' => null,
            ]);
        });
    }

    public function failed(\Throwable $exception): void
    {
        JobExecution::query()->whereKey($this->executionId)->update([
            'status' => 'failed',
            'attempts' => max(1, $this->attempts()),
            'error_code' => 'platform_smoke_failed',
            'error_message' => str($exception->getMessage())->limit(500),
            'finished_at' => now(),
        ]);
    }
}
