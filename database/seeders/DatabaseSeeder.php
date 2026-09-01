<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Academic\Domain\CurriculumSystemFields;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumFieldDefinition;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Modality;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        DB::transaction(function (): void {
            $roles = collect([
                RoleCode::Administrator->value => 'Administrador',
                RoleCode::Coordinator->value => 'Coordinador',
                RoleCode::Teacher->value => 'Docente',
            ])->mapWithKeys(function (string $name, string $code): array {
                $role = Role::query()->firstOrCreate(
                    ['codigo' => $code],
                    ['nombre' => $name],
                );

                return [$code => $role];
            });

            $faculty = Faculty::query()->firstOrCreate(
                ['codigo_institucional' => 'FICAYA'],
                ['nombre' => 'Facultad de Ciencias de la Ingeniería', 'activo' => true],
            );
            $career = Career::query()->firstOrCreate(
                ['codigo_institucional' => 'SOFTWARE'],
                ['facultad_id' => $faculty->id, 'nombre' => 'Software', 'activo' => true],
            );
            $campus = Campus::query()->firstOrCreate(
                ['codigo_institucional' => 'MATRIZ'],
                ['nombre' => 'Campus Matriz', 'activo' => true],
            );
            $modality = Modality::query()->firstOrCreate(
                ['codigo' => 'presencial'],
                ['nombre' => 'Presencial', 'activo' => true],
            );
            $period = AcademicPeriod::query()->firstOrCreate(
                ['codigo' => '2026-2027'],
                [
                    'nombre' => 'Periodo académico 2026-2027',
                    'fecha_inicio' => '2026-05-01',
                    'fecha_fin' => '2027-03-31',
                    'activo' => true,
                ],
            );
            $curriculum = CurriculumVersion::query()->firstOrCreate(
                ['carrera_id' => $career->id, 'codigo' => 'MALLA-SW-2024'],
                [
                    'numero_version' => 1,
                    'estado' => 'active',
                    'es_actual' => true,
                ],
            );
            foreach (CurriculumSystemFields::defaults() as $field) {
                CurriculumFieldDefinition::query()->firstOrCreate(
                    [
                        'version_malla_id' => $curriculum->id,
                        'clave' => $field['key'],
                    ],
                    [
                        'etiqueta' => $field['label'],
                        'tipo' => $field['type'],
                        'clave_sistema' => $field['system_key'],
                        'posicion' => $field['position'],
                        'visible_en_tarjeta' => true,
                        'totalizable' => $field['totalizable'],
                        'activo' => true,
                    ],
                );
            }
            $subject = Subject::query()->firstOrCreate(
                ['version_malla_id' => $curriculum->id, 'codigo_institucional' => 'SW-601'],
                [
                    'codigo_oculto_institucional' => 2601,
                    'nombre' => 'Arquitectura de Software',
                    'ciclo' => 6,
                    'creditos' => 4,
                    'horas_totales' => 160,
                    'horas_ac' => 64,
                    'horas_aa' => 96,
                    'activo' => true,
                ],
            );
            $offering = CourseOffering::query()->firstOrCreate(
                [
                    'periodo_academico_id' => $period->id,
                    'asignatura_id' => $subject->id,
                    'campus_id' => $campus->id,
                    'modalidad_id' => $modality->id,
                ],
                ['activo' => true],
            );
            $parallel = Parallel::query()->firstOrCreate(
                ['oferta_academica_id' => $offering->id, 'codigo' => 'A'],
                ['activo' => true],
            );

            $users = collect([
                RoleCode::Administrator->value => ['Administrador Demo', 'admin@silabos.test'],
                RoleCode::Coordinator->value => ['Coordinadora Demo', 'coordinador@silabos.test'],
                RoleCode::Teacher->value => ['Docente Demo', 'docente@silabos.test'],
            ])->mapWithKeys(function (array $data, string $code): array {
                $user = User::query()->updateOrCreate(
                    ['correo_electronico' => $data[1]],
                    [
                        'nombre' => $data[0],
                        'contrasena' => Hash::make('Demo-2026!'),
                        'correo_verificado_en' => now(),
                        'activo' => true,
                        'desactivado_en' => null,
                    ],
                );

                return [$code => $user];
            });

            foreach ($users as $code => $user) {
                $roleScope = [
                    'usuario_id' => $user->id,
                    'rol_id' => $roles[$code]->id,
                    'carrera_id' => $code === RoleCode::Administrator->value ? null : $career->id,
                ];
                $assignment = RoleAssignment::query()
                    ->where($roleScope)
                    ->whereNull('vigente_hasta')
                    ->first();

                if ($assignment === null) {
                    RoleAssignment::query()->create([
                        ...$roleScope,
                        'vigente_desde' => '2026-01-01 00:00:00',
                        'vigente_hasta' => null,
                        'activo' => true,
                    ]);
                } elseif (! $assignment->activo) {
                    $assignment->update(['activo' => true]);
                }
            }

            $coordinatorScope = [
                'usuario_id' => $users[RoleCode::Coordinator->value]->id,
                'carrera_id' => $career->id,
            ];
            $coordinatorAssignment = CoordinatorAssignment::query()
                ->where($coordinatorScope)
                ->whereNull('vigente_hasta')
                ->first();
            if ($coordinatorAssignment === null) {
                CoordinatorAssignment::query()->create([
                    ...$coordinatorScope,
                    'vigente_desde' => '2026-01-01 00:00:00',
                    'vigente_hasta' => null,
                    'activo' => true,
                ]);
            } elseif (! $coordinatorAssignment->activo) {
                $coordinatorAssignment->update(['activo' => true]);
            }

            $teacherScope = [
                'usuario_id' => $users[RoleCode::Teacher->value]->id,
                'paralelo_id' => $parallel->id,
            ];
            $teacherAssignment = TeacherAssignment::query()
                ->where($teacherScope)
                ->whereNull('vigente_hasta')
                ->first();
            if ($teacherAssignment === null) {
                TeacherAssignment::query()->create([
                    ...$teacherScope,
                    'vigente_desde' => '2026-01-01 00:00:00',
                    'vigente_hasta' => null,
                    'activo' => true,
                ]);
            } elseif (! $teacherAssignment->activo) {
                $teacherAssignment->update(['activo' => true]);
            }
        });
    }
}
