<?php

namespace App\Modules\Operations\Application;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Curriculum;
use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Database\Eloquent\Builder;

/**
 * «Puesta en marcha» del panel: qué debe hacer cada rol, en orden, y qué le falta.
 * Cada paso se calcula con datos reales; no se marca a mano ni se guarda. Cuando
 * todo está hecho, el panel deja de mostrarlo.
 *
 * @phpstan-type Step array{key: string, label: string, hint: string, done: bool, href: string}
 * @phpstan-type Checklist array{title: string, intro: string, done: int, total: int, steps: list<Step>}
 */
class SetupChecklist
{
    /**
     * Resumen para el encabezado: cuánto falta según el rol activo.
     *
     * @return array{title: string, done: int, total: int}|null
     */
    public function summaryFor(User $user, RoleAssignment $assignment): ?array
    {
        $checklist = match ($assignment->role->codigo) {
            RoleCode::Administrator->value => $this->forAdministrator(),
            RoleCode::Coordinator->value => $this->forCoordinator($assignment->carrera_id),
            RoleCode::Teacher->value => $this->forTeacher($user, $assignment->carrera_id),
            default => null,
        };

        return $checklist === null
            ? null
            : ['title' => $checklist['title'], 'done' => $checklist['done'], 'total' => $checklist['total']];
    }

    /** @return Checklist */
    public function forAdministrator(): array
    {
        $careers = Career::query()->where('activo', true);
        $coordinated = CoordinatorAssignment::query()->where('activo', true)->select('carrera_id');
        $careersWithoutCoordinator = (clone $careers)->whereNotIn('id', $coordinated)->count();
        $careerCount = (clone $careers)->count();
        $accounts = User::query()->where('activo', true)->whereHas('roleAssignments', fn (Builder $query) => $query
            ->where('activo', true)
            ->whereHas('role', fn (Builder $role) => $role->where('codigo', '!=', 'administrador')))->count();

        return $this->build(
            'Puesta en marcha de la institución',
            'En este orden. Cada paso habilita el siguiente; las coordinaciones no pueden empezar hasta que termine.',
            [
                $this->step('faculties', 'Registrar las facultades', 'Con su logo: encabeza el sílabo de sus carreras.', Faculty::query()->where('activo', true)->exists(), route('admin.academic.index', 'facultades')),
                $this->step('campus', 'Registrar los campus', 'Matriz, Laguacoto, CENI, San Miguel… donde se dictan clases.', Campus::query()->where('activo', true)->exists(), route('admin.academic.index', 'campus')),
                $this->step('careers', 'Registrar las carreras', 'Cada carrera cuelga de una facultad, con su campus y su modalidad aprobados.', $careerCount > 0, route('admin.academic.index', 'carreras')),
                $this->step('periods', 'Registrar el periodo académico', 'El periodo que abrirá el primer proceso de sílabos.', AcademicPeriod::query()->where('activo', true)->exists(), route('admin.academic.index', 'periodos-academicos')),
                $this->step('accounts', 'Crear las cuentas de coordinadores y docentes', 'Con su rol; el docente se asigna a paralelos desde Coordinación.', $accounts > 0, route('admin.users.index')),
                $this->step('coordinators', 'Asignar un coordinador a cada carrera', $careerCount > 0 && $careersWithoutCoordinator > 0 ? "Faltan {$careersWithoutCoordinator} de {$careerCount} carreras." : 'Titular o encargado, con vigencia.', $careerCount > 0 && $careersWithoutCoordinator === 0, route('admin.academic.index', 'carreras')),
                $this->step('template', 'Crear la plantilla de sílabo', 'Trae el formato oficial completo; solo hay que revisarla.', SyllabusTemplate::query()->where('es_institucional', true)->where('activo', true)->exists(), route('admin.templates.index')),
                $this->step('process', 'Crear y abrir el proceso de sílabos', 'Fechas de inicio y entrega; al abrirlo, las coordinaciones pueden convocar.', SyllabusProcess::query()->exists(), route('admin.processes.index')),
            ],
        );
    }

    /** @return Checklist */
    public function forCoordinator(?string $careerId): array
    {
        if ($careerId === null) {
            return $this->build('Puesta en marcha de la carrera', '', []);
        }

        $curriculum = Curriculum::query()->where('carrera_id', $careerId)->withCount('subjects')->first();
        $offerings = CourseOffering::query()->whereHas('subject.curriculum', fn (Builder $query) => $query->where('carrera_id', $careerId));
        $parallels = Parallel::query()->whereHas('offering.subject.curriculum', fn (Builder $query) => $query->where('carrera_id', $careerId));
        $assignments = TeacherAssignment::query()->where('activo', true)->whereHas('parallel.offering.subject.curriculum', fn (Builder $query) => $query->where('carrera_id', $careerId));
        $processOpen = SyllabusProcess::query()->where('estado', SyllabusProcess::STATE_OPEN)->exists();

        return $this->build(
            'Puesta en marcha de la carrera',
            'En este orden. Al abrir la convocatoria se crea un sílabo por paralelo con su docente.',
            [
                $this->step('curriculum', 'Armar la malla con sus materias', 'Ciclos, materias, horas, créditos y prerrequisitos.', $curriculum !== null && $curriculum->subjects_count > 0, route('coordination.academic.curricula.index')),
                $this->step('offerings', 'Abrir las ofertas del periodo', 'Materia, periodo, campus y modalidad.', (clone $offerings)->exists(), route('coordination.academic.offerings.index')),
                $this->step('parallels', 'Crear los paralelos', 'Desde Ofertas, con su jornada: matutina, vespertina o nocturna.', (clone $parallels)->exists(), route('coordination.academic.offerings.index')),
                $this->step('teachers', 'Asignar un docente a cada paralelo', 'Los docentes ya deben tener cuenta (los crea Administración).', (clone $assignments)->exists(), route('coordination.academic.teacher-assignments.index')),
                $this->step('sources', 'Registrar al menos una fuente académica', 'Documento de apoyo que la convocatoria fija para los docentes.', AcademicSource::query()->where('carrera_id', $careerId)->where('activo', true)->exists(), route('sources.index')),
                $this->step('convocation', 'Crear y abrir la convocatoria', $processOpen ? 'El proceso institucional está abierto: ya puede convocar.' : 'Espera a que Administración abra el proceso de sílabos.', Convocation::query()->where('carrera_id', $careerId)->exists(), route('convocations.index')),
            ],
        );
    }

    /** @return Checklist */
    public function forTeacher(User $user, ?string $careerId): array
    {
        $own = Syllabus::query()
            ->when($careerId !== null, fn (Builder $query) => $query->whereHas('convocation', fn (Builder $convocation) => $convocation->where('carrera_id', $careerId)))
            ->whereHas('collaborators', fn (Builder $query) => $query->where('usuario_id', $user->id));
        $total = (clone $own)->count();
        $started = (clone $own)->where('estado', '!=', 'sin_iniciar')->count();
        $submitted = (clone $own)->whereIn('estado', ['en_revision', 'aprobado'])->count();
        $index = route('syllabi.index');

        return $this->build(
            'Sus sílabos, paso a paso',
            $total === 0 ? 'Cuando Coordinación abra la convocatoria, aquí aparecerán sus sílabos.' : 'Cada sílabo se inicia, se completa y se envía a revisión.',
            [
                $this->step('assigned', 'Recibir los sílabos asignados', $total > 0 ? "{$total} asignados." : 'Los asigna Coordinación al abrir la convocatoria.', $total > 0, $index),
                $this->step('started', 'Iniciar cada sílabo', $total > 0 ? "{$started} de {$total} iniciados." : 'Al iniciar se copian los datos de la malla.', $total > 0 && $started === $total, $index),
                $this->step('submitted', 'Completar y enviar a revisión', $total > 0 ? "{$submitted} de {$total} enviados." : 'Antes de la fecha de entrega.', $total > 0 && $submitted === $total, $index),
            ],
        );
    }

    /**
     * @param  list<Step>  $steps
     * @return Checklist
     */
    private function build(string $title, string $intro, array $steps): array
    {
        $done = count(array_filter($steps, fn (array $step): bool => $step['done']));

        return ['title' => $title, 'intro' => $intro, 'done' => $done, 'total' => count($steps), 'steps' => $steps];
    }

    /** @return Step */
    private function step(string $key, string $label, string $hint, bool $done, string $href): array
    {
        return ['key' => $key, 'label' => $label, 'hint' => $hint, 'done' => $done, 'href' => $href];
    }
}
