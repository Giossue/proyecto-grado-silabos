<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * Las columnas físicas están en español (I-28). Laravel y Fortify esperan los nombres
 * del starter en varios puntos internos, así que este modelo declara los puentes:
 * `$authPasswordName`, `$rememberTokenName`, los overrides de correo/verificación y los
 * accessors que traducen los atributos `two_factor_*` que Fortify fija por literal.
 *
 * @property string $id
 * @property string $nombre
 * @property string $correo_electronico
 * @property string|null $documento_identidad
 * @property Carbon|null $correo_verificado_en
 * @property string $contrasena
 * @property bool $activo
 * @property bool $debe_cambiar_contrasena
 * @property Carbon|null $desactivado_en
 * @property string|null $secreto_dos_factores
 * @property string|null $codigos_recuperacion_dos_factores
 * @property Carbon|null $dos_factores_confirmado_en
 * @property string|null $codigo_recordarme
 * @property Carbon|null $creado_en
 * @property Carbon|null $actualizado_en
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property mixed $two_factor_confirmed_at
 */
#[Fillable(['nombre', 'correo_electronico', 'documento_identidad', 'contrasena', 'activo', 'desactivado_en', 'debe_cambiar_contrasena'])]
#[Hidden(['contrasena', 'secreto_dos_factores', 'codigos_recuperacion_dos_factores', 'codigo_recordarme'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasUuids, Notifiable, TwoFactorAuthenticatable;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'usuarios';

    protected $authPasswordName = 'contrasena';

    protected $rememberTokenName = 'codigo_recordarme';

    /** @return HasMany<RoleAssignment, $this> */
    public function roleAssignments(): HasMany
    {
        return $this->hasMany(RoleAssignment::class, 'usuario_id');
    }

    public function getEmailForPasswordReset(): string
    {
        return $this->correo_electronico;
    }

    public function getEmailForVerification(): string
    {
        return $this->correo_electronico;
    }

    public function hasVerifiedEmail(): bool
    {
        return $this->correo_verificado_en !== null;
    }

    public function markEmailAsVerified(): bool
    {
        return $this->forceFill(['correo_verificado_en' => $this->freshTimestamp()])->save();
    }

    public function markEmailAsUnverified(): bool
    {
        return $this->forceFill(['correo_verificado_en' => null])->save();
    }

    public function routeNotificationForMail(): string
    {
        return $this->correo_electronico;
    }

    /** Fortify lee y escribe `two_factor_secret` por literal.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function twoFactorSecret(): Attribute
    {
        return Attribute::make(
            get: fn (mixed $value, array $attributes): ?string => $attributes['secreto_dos_factores'] ?? null,
            set: fn (mixed $value): array => ['secreto_dos_factores' => $value],
        );
    }

    /** @return Attribute<string|null, string|null> */
    protected function twoFactorRecoveryCodes(): Attribute
    {
        return Attribute::make(
            get: fn (mixed $value, array $attributes): ?string => $attributes['codigos_recuperacion_dos_factores'] ?? null,
            set: fn (mixed $value): array => ['codigos_recuperacion_dos_factores' => $value],
        );
    }

    /** @return Attribute<mixed, mixed> */
    protected function twoFactorConfirmedAt(): Attribute
    {
        // El valor del mutator no pasa por casts(): se serializa aquí mismo.
        return Attribute::make(
            get: fn (mixed $value, array $attributes): mixed => $attributes['dos_factores_confirmado_en'] ?? null,
            set: fn (mixed $value): array => [
                'dos_factores_confirmado_en' => $value === null ? null : $this->fromDateTime($value),
            ],
        );
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'correo_verificado_en' => 'datetime',
            'contrasena' => 'hashed',
            'activo' => 'boolean',
            'debe_cambiar_contrasena' => 'boolean',
            'desactivado_en' => 'datetime',
            'dos_factores_confirmado_en' => 'datetime',
        ];
    }
}
