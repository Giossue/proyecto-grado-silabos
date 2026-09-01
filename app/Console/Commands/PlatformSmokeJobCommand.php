<?php

namespace App\Console\Commands;

use App\Modules\Operations\Application\Actions\DispatchPlatformSmoke;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class PlatformSmokeJobCommand extends Command
{
    protected $signature = 'platform:smoke-job {--key= : Clave idempotente opcional}';

    protected $description = 'Despacha un trabajo mínimo para comprobar PostgreSQL y la cola';

    public function handle(DispatchPlatformSmoke $action): int
    {
        $key = $this->option('key');
        $idempotencyKey = is_string($key) && $key !== '' ? $key : 'smoke:'.Str::uuid();
        $execution = $action->execute($idempotencyKey);

        $this->components->info("Trabajo {$execution->id} en estado {$execution->estado}.");

        return self::SUCCESS;
    }
}
