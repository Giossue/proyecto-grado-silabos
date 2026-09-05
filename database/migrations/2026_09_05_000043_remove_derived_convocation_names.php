<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void { Schema::table('convocatorias_universidad', fn (Blueprint $t) => $t->dropColumn('nombre')); Schema::table('convocatorias_carreras', fn (Blueprint $t) => $t->dropColumn('nombre')); }
 public function down(): void { throw new RuntimeException('I-52 elimina datos derivados y no admite reversión automática.'); }
};
