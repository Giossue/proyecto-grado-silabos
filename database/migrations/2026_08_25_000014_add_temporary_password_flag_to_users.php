<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * La contraseña con la que un administrador crea una cuenta es de un solo uso: la
     * conoce quien la generó, así que deja de ser un secreto en cuanto se entrega. La
     * marca obliga a cambiarla antes de operar y se apaga con el primer cambio.
     */
    public function up(): void
    {
        Schema::table('usuarios', function (Blueprint $table): void {
            $table->boolean('must_change_password')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('usuarios', function (Blueprint $table): void {
            $table->dropColumn('must_change_password');
        });
    }
};
