<?php

namespace Tests\Feature\Configuration;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Support\MakesTransparentPng;
use Tests\TestCase;

/** I-34: logos del encabezado con medida fija y sin fondo. */
class InstitutionalLogosTest extends TestCase
{
    use MakesTransparentPng;
    use RefreshDatabase;

    private User $administrator;

    private RoleAssignment $administratorContext;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->seed(DatabaseSeeder::class);
        $this->administrator = User::query()->where('correo_electronico', 'admin@silabos.test')->firstOrFail();
        $this->administratorContext = $this->administrator->roleAssignments()->firstOrFail();
    }

    public function test_administrator_replaces_the_university_logo_and_it_is_served_publicly(): void
    {
        $this->actingAsAdministrator()
            ->post(route('admin.templates.logo.store'), ['logo' => $this->transparentPng(850, 315)])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        Storage::disk('private')->assertExists('logos/institucion.png');
        $this->assertDatabaseHas('eventos_auditoria', ['accion' => 'institucion.logo_actualizado']);

        // Sin sesión: la imagen es pública.
        $this->get(route('logos.institution'))->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_the_university_logo_must_be_a_transparent_png_of_the_exact_size(): void
    {
        $this->actingAsAdministrator()
            ->from(route('admin.templates.index'))
            ->post(route('admin.templates.logo.store'), ['logo' => $this->transparentPng(800, 300)])
            ->assertSessionHasErrors('logo');

        $this->actingAsAdministrator()
            ->from(route('admin.templates.index'))
            ->post(route('admin.templates.logo.store'), ['logo' => $this->opaquePng(850, 315)])
            ->assertSessionHasErrors('logo');

        Storage::disk('private')->assertMissing('logos/institucion.png');
    }

    public function test_a_faculty_requires_its_logo_and_serves_it(): void
    {
        $this->actingAsAdministrator()
            ->from(route('admin.academic.index', 'facultades'))
            ->post(route('admin.academic.store', 'facultad'), ['code' => 'FAC-SL', 'nombre' => 'Sin logo'])
            ->assertSessionHasErrors('logo');
        $this->assertDatabaseMissing('facultades', ['codigo_institucional' => 'FAC-SL']);

        $this->actingAsAdministrator()
            ->post(route('admin.academic.store', 'facultad'), [
                'code' => 'FAC-CL',
                'nombre' => 'Con logo',
                'logo' => $this->transparentPng(600, 180),
            ])
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        $faculty = Faculty::query()->where('codigo_institucional', 'FAC-CL')->firstOrFail();
        $this->assertSame("logos/facultades/{$faculty->id}.png", $faculty->logo_ruta);
        Storage::disk('private')->assertExists($faculty->logo_ruta);
        $this->get(route('logos.faculty', $faculty))->assertOk()->assertHeader('Content-Type', 'image/png');

        // Sin subida propia, la facultad muestra el logo de fábrica.
        $legacy = Faculty::query()->where('codigo_institucional', '!=', 'FAC-CL')->firstOrFail();
        $this->get(route('logos.faculty', $legacy))->assertOk();
    }

    private function actingAsAdministrator(): static
    {
        $this->actingAs($this->administrator)->withSession(['active_role_assignment_id' => $this->administratorContext->id]);

        return $this;
    }
}
