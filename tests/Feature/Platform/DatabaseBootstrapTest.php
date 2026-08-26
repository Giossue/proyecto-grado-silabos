<?php

namespace Tests\Feature\Platform;

use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DatabaseBootstrapTest extends TestCase
{
    use RefreshDatabase;

    public function test_postgresql_connection_uses_utc(): void
    {
        $timezone = DB::selectOne('show timezone');

        $this->assertSame('pgsql', config('database.default'));
        $this->assertSame('pgsql', DB::connection()->getDriverName());
        $this->assertSame('UTC', $timezone?->TimeZone ?? null);
    }

    public function test_demonstration_seeder_is_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(3, RoleAssignment::query()->count());
        $this->assertSame(1, CoordinatorAssignment::query()->count());
        $this->assertSame(1, TeacherAssignment::query()->count());
    }
}
