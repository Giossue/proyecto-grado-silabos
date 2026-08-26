<?php

use App\Http\Middleware\AddSecurityHeaders;
use App\Http\Middleware\AssignCorrelationId;
use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\RequireActiveRole;
use App\Http\Middleware\RequirePasswordChange;
use App\Modules\Syllabus\Domain\Exceptions\DraftConflictException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/health/live',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'active-role' => RequireActiveRole::class,
        ]);

        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            AssignCorrelationId::class,
            EnsureActiveUser::class,
            RequirePasswordChange::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            AddSecurityHeaders::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(
            fn (DraftConflictException $exception, Request $request) => $request->expectsJson()
                ? response()->json([
                    'message' => $exception->getMessage(),
                    'code' => 'draft_version_conflict',
                    'current_lock_version' => $exception->currentVersion,
                ], 409)
                : back()->withErrors([
                    'lock_version' => $exception->getMessage(),
                ]),
        );
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
