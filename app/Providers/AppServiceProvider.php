<?php

namespace App\Providers;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Access\AcademicRoleEligibility;
use App\Modules\AiAssistance\Domain\Contracts\AiAnalysisGateway;
use App\Modules\AiAssistance\Infrastructure\Gateways\BaselineAiAnalysisGateway;
use App\Modules\AiAssistance\Infrastructure\Gateways\DisabledAiAnalysisGateway;
use App\Modules\AiAssistance\Infrastructure\Gateways\HttpAiAnalysisGateway;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Documents\Domain\Contracts\DocumentRenderer;
use App\Modules\Documents\Domain\Policies\ExportArtifactPolicy;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Documents\Infrastructure\Rendering\BaselineDocumentRenderer;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Application\Contracts\RoleEligibility;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Domain\Policies\UserPolicy;
use App\Modules\Integrations\Application\SianetAcademicRecordMapper;
use App\Modules\Integrations\Application\SianetIdentityReconciler;
use App\Modules\Integrations\Domain\Contracts\AcademicRecordMapper;
use App\Modules\Integrations\Domain\Contracts\ImportReconciler;
use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Infrastructure\Readers\AnonymizedFixtureInstitutionalDataReader;
use App\Modules\Integrations\Infrastructure\Readers\DisabledInstitutionalDataReader;
use App\Modules\Syllabus\Domain\Policies\ConvocationPolicy;
use App\Modules\Syllabus\Domain\Policies\SyllabusPolicy;
use App\Modules\Syllabus\Domain\Policies\SyllabusRevisionPolicy;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusRevision;
use Carbon\CarbonImmutable;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(RoleEligibility::class, AcademicRoleEligibility::class);
        $this->app->bind(DocumentRenderer::class, BaselineDocumentRenderer::class);
        $this->app->bind(AiAnalysisGateway::class, function (): AiAnalysisGateway {
            return match ((string) config('ai.driver')) {
                'baseline' => app(BaselineAiAnalysisGateway::class),
                'http' => app(HttpAiAnalysisGateway::class),
                default => app(DisabledAiAnalysisGateway::class),
            };
        });
        $this->app->bind(InstitutionalDataReader::class, function (): InstitutionalDataReader {
            return match ((string) config('integrations.institutional_import.driver')) {
                'fixture' => app(AnonymizedFixtureInstitutionalDataReader::class),
                default => app(DisabledInstitutionalDataReader::class),
            };
        });
        $this->app->bind(AcademicRecordMapper::class, SianetAcademicRecordMapper::class);
        $this->app->bind(ImportReconciler::class, SianetIdentityReconciler::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Convocation::class, ConvocationPolicy::class);
        Gate::policy(Syllabus::class, SyllabusPolicy::class);
        Gate::policy(SyllabusRevision::class, SyllabusRevisionPolicy::class);
        Gate::policy(ExportArtifact::class, ExportArtifactPolicy::class);
        Gate::define('manage-academic-governance', fn (User $user): bool => $user->active
            && AcademicStructurePermissions::isGovernanceContext(
                app(ActiveRole::class)->resolve(request()),
            ));
        Gate::define('manage-career-academics', fn (User $user): bool => $user->active
            && AcademicStructurePermissions::isCareerContext(
                app(ActiveRole::class)->resolve(request()),
            ));
        Gate::define(
            'manage-templates',
            fn (User $user): bool => $user->active
                && app(ActiveRole::class)->hasRole(request(), RoleCode::Administrator),
        );
        Gate::define(
            'operate-jobs',
            fn (User $user): bool => $user->active
                && app(ActiveRole::class)->hasRole(request(), RoleCode::Administrator),
        );
        Gate::define(
            'view-audit',
            fn (User $user): bool => $user->active
                && app(ActiveRole::class)->hasRole(request(), RoleCode::Administrator),
        );
        Gate::define(
            'operate-imports',
            fn (User $user): bool => $user->active
                && app(ActiveRole::class)->hasRole(request(), RoleCode::Administrator),
        );
        Gate::define('view-sources', function (User $user): bool {
            $activeRole = app(ActiveRole::class)->resolve(request());

            return $user->active && in_array(
                $activeRole?->role->codigo,
                [RoleCode::Administrator->value, RoleCode::Coordinator->value],
                true,
            );
        });
        Gate::define('manage-source', function (User $user, AcademicSource $source): bool {
            $activeRole = app(ActiveRole::class)->resolve(request());

            return $user->active && ($activeRole?->role->codigo === RoleCode::Administrator->value
                || ($activeRole?->role->codigo === RoleCode::Coordinator->value
                    && $activeRole->carrera_id === $source->carrera_id));
        });
        RateLimiter::for('ai-analysis', function (Request $request): Limit {
            $user = $request->user();
            $syllabus = $request->route('syllabus');
            $actorKey = $user instanceof User ? $user->id : (string) $request->ip();
            $syllabusKey = $syllabus instanceof Syllabus
                ? $syllabus->id
                : (is_string($syllabus) ? $syllabus : 'unknown');

            return Limit::perMinute((int) config('ai.limits.requests_per_minute'))
                ->by("ai-analysis:{$actorKey}:{$syllabusKey}");
        });
        RateLimiter::for('institutional-import', function (Request $request): Limit {
            $user = $request->user();
            $actorKey = $user instanceof User ? $user->id : (string) $request->ip();

            return Limit::perMinute((int) config('integrations.institutional_import.limits.requests_per_minute'))
                ->by("institutional-import:{$actorKey}");
        });

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
