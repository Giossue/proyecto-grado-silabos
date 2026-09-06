<?php

namespace Tests\Feature\Academic;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoordinatorAssignmentConstraintTest extends TestCase
{
    use RefreshDatabase;

    public function test_postgresql_rejects_a_second_active_coordinator_for_the_same_career(): void
    {
        $this->seed(DatabaseSeeder::class);
        $current = CoordinatorAssignment::query()->firstOrFail();
        $other = User::factory()->create();

        $this->expectException(QueryException::class);

        CoordinatorAssignment::query()->create([
            'usuario_id' => $other->id,
            'carrera_id' => $current->carrera_id,
            'activo' => true,
        ]);
    }
}
