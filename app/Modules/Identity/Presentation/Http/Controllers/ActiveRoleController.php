<?php

namespace App\Modules\Identity\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Identity\Application\Actions\SelectActiveRole;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Presentation\Http\Requests\SelectActiveRoleRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ActiveRoleController extends Controller
{
    public function index(Request $request, ActiveRole $roles): Response|RedirectResponse
    {
        $user = $request->user();

        if ($user instanceof User) {
            $eligible = $roles->eligible($user);
            if ($eligible->count() === 1 && ! $roles->requiresExplicitSelection($eligible->firstOrFail())) {
                return to_route('dashboard');
            }
        }

        return Inertia::render('Role/Select');
    }

    public function store(SelectActiveRoleRequest $request, SelectActiveRole $action): RedirectResponse
    {
        $user = $request->user();

        abort_unless($user instanceof User, 401);
        $action->execute($user, $request->string('role_assignment_id')->toString(), $request);

        return to_route('dashboard')->with('success', 'Ámbito de trabajo seleccionado.');
    }
}
