<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use App\Models\User;
use App\Modules\Identity\Application\Actions\UpdateManagedUserProfile;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/Profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
            'canEditIdentity' => $request->user()->can('updateProfileData', $request->user()),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(
        ProfileUpdateRequest $request,
        UpdateManagedUserProfile $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($actor, [
            'nombre' => $request->string('nombre')->toString(),
            'correo_electronico' => $request->string('correo_electronico')->toString(),
        ], $actor, $request);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Perfil actualizado.']);

        return to_route('profile.edit');
    }
}
