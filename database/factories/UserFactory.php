<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'nombre' => fake()->name(),
            'correo_electronico' => fake()->unique()->safeEmail(),
            'correo_verificado_en' => now(),
            'contrasena' => static::$password ??= Hash::make('password'),
            'activo' => true,
            'codigo_recordarme' => Str::random(10),
            'secreto_dos_factores' => null,
            'codigos_recuperacion_dos_factores' => null,
            'dos_factores_confirmado_en' => null,
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'correo_verificado_en' => null,
        ]);
    }

    /**
     * Indicate that the account cannot create or retain a session.
     */
    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => [
            'activo' => false,
        ]);
    }

    /**
     * Indicate that the model has two-factor authentication configured.
     */
    public function withTwoFactor(): static
    {
        return $this->state(fn (array $attributes) => [
            'secreto_dos_factores' => encrypt('secret'),
            'codigos_recuperacion_dos_factores' => encrypt(json_encode(['recovery-code-1'])),
            'dos_factores_confirmado_en' => now(),
        ]);
    }
}
