<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El acceso por llave que traía el starter se retira: la institución administra las
 * cuentas y el acceso es con correo y contraseña.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('passkeys');
    }

    public function down(): void
    {
        // Misma definición que creó `2024_01_01_000000_create_passkeys_table`.
        Schema::create('passkeys', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('user_id')->constrained('usuarios')->cascadeOnDelete();
            $table->string('name');
            $table->string('credential_id')->unique();
            $table->json('credential');
            $table->timestampTz('last_used_at')->nullable();
            $table->timestampsTz();

            $table->index('user_id');
        });
    }
};
