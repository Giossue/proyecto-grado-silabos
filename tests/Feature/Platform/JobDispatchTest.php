<?php

namespace Tests\Feature\Platform;

use App\Modules\AiAssistance\Infrastructure\Jobs\AnalyzeSyllabusFieldJob;
use App\Modules\Documents\Infrastructure\Jobs\GenerateSyllabusExportJob;
use App\Modules\Operations\Application\Actions\DispatchPlatformSmoke;
use App\Modules\Operations\Infrastructure\Jobs\DeliverInternalNotificationJob;
use App\Modules\Operations\Infrastructure\Jobs\PlatformSmokeJob;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class JobDispatchTest extends TestCase
{
    use RefreshDatabase;

    public function test_job_is_dispatched_after_commit_and_repeated_request_is_idempotent(): void
    {
        Queue::fake();
        $action = app(DispatchPlatformSmoke::class);

        $first = $action->execute('CP-N-smoke-idempotent');
        $second = $action->execute('CP-N-smoke-idempotent');

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, JobExecution::query()->count());
        Queue::assertPushed(PlatformSmokeJob::class, 1);
    }

    public function test_processing_the_same_job_twice_keeps_one_completed_execution(): void
    {
        $execution = JobExecution::query()->create([
            'tipo' => 'plataforma.verificacion',
            'estado' => 'pendiente',
            'clave_idempotencia' => 'CP-N-smoke-replay',
        ]);
        $job = new PlatformSmokeJob($execution->id);

        $job->handle();
        $job->handle();

        $execution->refresh();
        $this->assertSame('completada', $execution->estado);
        $this->assertSame(100, $execution->progreso);
        $this->assertSame(1, JobExecution::query()->count());
    }

    public function test_redis_retry_window_exceeds_every_job_timeout(): void
    {
        $jobs = [
            new PlatformSmokeJob('00000000-0000-0000-0000-000000000001'),
            new DeliverInternalNotificationJob('00000000-0000-0000-0000-000000000002'),
            new GenerateSyllabusExportJob('00000000-0000-0000-0000-000000000003'),
            new AnalyzeSyllabusFieldJob('00000000-0000-0000-0000-000000000004'),
        ];
        $longestJobTimeout = max(array_map(
            static fn (object $job): int => $job->timeout,
            $jobs,
        ));

        $this->assertGreaterThan(
            $longestJobTimeout,
            (int) config('queue.connections.redis.retry_after'),
            'REDIS_QUEUE_RETRY_AFTER debe superar el timeout del trabajo más largo.',
        );
    }
}
