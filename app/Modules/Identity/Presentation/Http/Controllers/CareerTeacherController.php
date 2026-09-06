<?php

namespace App\Modules\Identity\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Identity\Application\Actions\CreateCareerTeacher;
use App\Modules\Identity\Presentation\Http\Requests\CreateCareerTeacherRequest;
use Illuminate\Http\RedirectResponse;

class CareerTeacherController extends Controller
{
    public function store(CreateCareerTeacherRequest $request, CreateCareerTeacher $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $result = $action->execute($request->teacherData(), $actor, $request);

        $message = $result['created']
            ? 'Docente creado para su carrera. Recibirá las credenciales por correo.'
            : ($result['attached']
                ? 'Docente incorporado a su carrera. Conserva su nombre y acceso actuales.'
                : 'El docente ya está disponible en su carrera. Conserva su nombre y acceso actuales.');

        return back()->with('success', $message);
    }
}
