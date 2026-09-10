<?php

namespace Tests\Support;

use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Application\InstitutionalLogos;
use Illuminate\Support\Facades\Storage;

trait ConfiguresFacultyLogos
{
    use MakesTransparentPng;

    protected function configureFacultyLogos(): void
    {
        Storage::fake('private');
        $logos = app(InstitutionalLogos::class);

        Faculty::query()->each(
            fn (Faculty $faculty) => $logos->storeFaculty(
                $faculty,
                $this->transparentPng(600, 180),
            ),
        );
    }
}
