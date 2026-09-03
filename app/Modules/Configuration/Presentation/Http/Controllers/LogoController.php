<?php

namespace App\Modules\Configuration\Presentation\Http\Controllers;

use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Configuration\Application\InstitutionalLogos;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Sirve los logos del encabezado; sin sesión, porque son imagen pública de la institución. */
class LogoController
{
    public function __construct(private readonly InstitutionalLogos $logos) {}

    public function institution(): BinaryFileResponse
    {
        return $this->file($this->logos->institutionPath());
    }

    public function faculty(Faculty $faculty): BinaryFileResponse
    {
        return $this->file($this->logos->facultyPath($faculty));
    }

    private function file(string $path): BinaryFileResponse
    {
        return response()->file($path, ['Cache-Control' => 'public, max-age=300']);
    }
}
