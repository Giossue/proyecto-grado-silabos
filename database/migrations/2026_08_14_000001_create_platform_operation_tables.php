<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ejecuciones_trabajo', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type', 120);
            $table->string('status', 24)->default('pending');
            $table->string('idempotency_key', 160)->unique();
            $table->uuid('correlation_id')->nullable()->index();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('progress')->default(0);
            $table->jsonb('result')->nullable();
            $table->string('error_code', 80)->nullable();
            $table->text('error_message')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->timestampsTz();

            $table->index(['status', 'created_at']);
        });

        DB::statement("ALTER TABLE ejecuciones_trabajo ADD CONSTRAINT ejecuciones_trabajo_estado_check CHECK (status IN ('pending', 'running', 'completed', 'failed'))");
        DB::statement('ALTER TABLE ejecuciones_trabajo ADD CONSTRAINT ejecuciones_trabajo_progreso_check CHECK (progress BETWEEN 0 AND 100)');
    }

    public function down(): void
    {
        Schema::dropIfExists('ejecuciones_trabajo');
    }
};
