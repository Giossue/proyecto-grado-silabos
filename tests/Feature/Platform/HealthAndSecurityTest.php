<?php

namespace Tests\Feature\Platform;

use App\Http\Middleware\AddSecurityHeaders;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HealthAndSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_liveness_and_readiness_do_not_disclose_infrastructure(): void
    {
        $this->get('/health/live')->assertOk();

        $this->get(route('health.ready'))
            ->assertOk()
            ->assertExactJson(['status' => 'ready'])
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
            ->assertHeader('Cross-Origin-Resource-Policy', 'same-origin')
            ->assertHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
            ->assertCookieMissing('XSRF-TOKEN')
            ->assertCookieMissing((string) config('session.cookie'));
    }

    public function test_each_web_response_has_a_valid_correlation_identifier(): void
    {
        $response = $this->get(route('home'));

        $response->assertHeader('X-Correlation-ID');
        $this->assertTrue(str($response->headers->get('X-Correlation-ID'))->isUuid());
    }

    public function test_private_storage_is_not_served_publicly(): void
    {
        Storage::fake('private');
        Storage::disk('private')->put('smoke.txt', 'contenido sintético');

        Storage::disk('private')->assertExists('smoke.txt');
        $this->assertFalse((bool) config('filesystems.disks.private.serve'));
        $this->assertSame('private', config('filesystems.disks.private.visibility'));
        $this->get('/storage/smoke.txt')->assertForbidden();
    }

    public function test_hsts_is_only_emitted_for_secure_production_requests(): void
    {
        $this->get(route('home'))->assertHeaderMissing('Strict-Transport-Security');

        $this->app->detectEnvironment(fn (): string => 'production');
        $request = Request::create('https://silabos.test', 'GET');
        $response = app(AddSecurityHeaders::class)->handle(
            $request,
            fn () => response('ok'),
        );

        $this->assertSame(
            'max-age=31536000; includeSubDomains',
            $response->headers->get('Strict-Transport-Security'),
        );
    }
}
