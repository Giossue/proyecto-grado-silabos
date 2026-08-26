<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\PasswordUpdateRequest;
use App\Http\Requests\Settings\TwoFactorAuthenticationRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Fortify\Features;

class SecurityController extends Controller
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * Show the user's security settings page.
     */
    public function edit(TwoFactorAuthenticationRequest $request): Response
    {
        $props = [
            'canManageTwoFactor' => Features::canManageTwoFactorAuthentication(),
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ];

        if (Features::canManageTwoFactorAuthentication()) {
            $request->ensureStateIsValid();

            $props['twoFactorEnabled'] = $request->user()->hasEnabledTwoFactorAuthentication();
            $props['requiresConfirmation'] = Features::optionEnabled(Features::twoFactorAuthentication(), 'confirm');
        }

        return Inertia::render('settings/Security', $props);
    }

    /**
     * Update the user's password.
     */
    public function update(PasswordUpdateRequest $request): RedirectResponse
    {
        $user = $request->user();
        // Cualquier cambio deja de ser temporal, venga del diálogo que bloquea la sesión
        // o de esta pantalla: la contraseña ya solo la conoce su titular.
        $wasTemporary = $user->must_change_password;

        $user->update([
            'password' => $request->password,
            'must_change_password' => false,
        ]);

        if ($wasTemporary) {
            // Se audita el hecho, nunca el valor: la contraseña no entra en auditoría.
            $this->audit->execute(
                actorId: $user->id,
                roleAssignmentId: $this->roles->resolve($request)?->id,
                action: 'user.temporary_password_changed',
                resourceType: 'user',
                resourceId: $user->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Contraseña actualizada.']);

        return back();
    }
}
